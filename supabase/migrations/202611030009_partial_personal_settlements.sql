-- Partial settlement for individual balances: an entry keeps its original amount and records how much of it has
-- been paid. It stays open until settled_amount_minor reaches amount_minor, so the remaining balance stays visible.
alter table public.personal_transactions
add column if not exists settled_amount_minor bigint not null default 0;

-- Entries settled before this migration were paid in full.
update public.personal_transactions
set settled_amount_minor = amount_minor
where status = 'settled' and settled_amount_minor = 0;

-- The old constraint required settled_at to be null while status was open. A partly paid entry is still open but
-- has a settlement timestamp, so replace that rule with one that understands both full and partial payments.
do $$
declare
  check_name text;
begin
  for check_name in
    select conname
    from pg_constraint
    where conrelid = 'public.personal_transactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%settled_at%'
  loop
    execute format('alter table public.personal_transactions drop constraint %I', check_name);
  end loop;
end;
$$;

alter table public.personal_transactions
add constraint personal_transactions_settlement_check check (
  settled_amount_minor between 0 and amount_minor
  and (status = 'open' or (status = 'settled' and settled_amount_minor = amount_minor))
  and (settled_amount_minor = 0 or settled_at is not null)
);

-- The old three-argument version cannot express a partial amount, so drop it before adding the new signature.
drop function if exists public.app_settle_personal_transaction(uuid, uuid, text);

create function public.app_settle_personal_transaction(
  p_actor uuid,
  p_transaction uuid,
  p_idempotency_key text,
  p_amount_minor bigint default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  payload_hash text := encode(digest(p_transaction::text || ':' || coalesce(p_amount_minor::text, 'full'), 'sha256'), 'hex');
  existing_id uuid;
  target public.personal_transactions;
  remaining bigint;
  payment bigint;
begin
  existing_id := private.assert_idempotency(p_actor, p_idempotency_key, 'settle_personal_transaction', payload_hash);
  if existing_id is not null then return; end if;

  select * into target
  from public.personal_transactions
  where id = p_transaction and user_id = p_actor
  for update;
  if not found then raise exception 'individual entry not found'; end if;

  -- Already fully settled: keep the old idempotent behaviour instead of failing a repeated tap.
  if target.status = 'settled' then
    insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
    values (p_actor, p_idempotency_key, 'settle_personal_transaction', payload_hash, p_transaction);
    return;
  end if;

  remaining := target.amount_minor - target.settled_amount_minor;
  payment := coalesce(p_amount_minor, remaining);
  if payment <= 0 then raise exception 'enter an amount greater than zero'; end if;
  if payment > remaining then raise exception 'the amount is more than what is left on this entry'; end if;

  update public.personal_transactions
  set
    settled_amount_minor = target.settled_amount_minor + payment,
    status = case when target.settled_amount_minor + payment >= target.amount_minor then 'settled' else 'open' end,
    settled_at = now()
  where id = p_transaction;

  insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
  values (p_actor, p_idempotency_key, 'settle_personal_transaction', payload_hash, p_transaction);
end;
$$;

revoke all on function public.app_settle_personal_transaction(uuid, uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.app_settle_personal_transaction(uuid, uuid, text, bigint) to service_role;

-- Settle-all keeps its existing meaning: clear everything that is still open on each selected entry.
create or replace function public.app_settle_personal_transactions(p_actor uuid, p_transactions uuid[], p_idempotency_key text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  payload_hash text := encode(digest(to_jsonb(p_transactions)::text, 'sha256'), 'hex');
  existing_id uuid;
  selected_count integer := cardinality(p_transactions);
  owned_count integer;
begin
  if selected_count is null or selected_count = 0 then raise exception 'choose at least one individual entry'; end if;
  existing_id := private.assert_idempotency(p_actor, p_idempotency_key, 'settle_personal_transactions', payload_hash);
  if existing_id is not null then return; end if;

  select count(*) into owned_count
  from (
    select id
    from public.personal_transactions
    where user_id = p_actor and id = any(p_transactions)
    for update
  ) as locked_transactions;
  if owned_count <> selected_count then raise exception 'individual entry not found'; end if;

  update public.personal_transactions
  set status = 'settled', settled_amount_minor = amount_minor, settled_at = now()
  where user_id = p_actor and id = any(p_transactions) and status = 'open';

  insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
  values (p_actor, p_idempotency_key, 'settle_personal_transactions', payload_hash, p_transactions[1]);
end;
$$;

-- Same as 202609180007, plus settledAmountMinor on personal rows (null for group rows, dropped by jsonb_strip_nulls).
create or replace function public.app_get_transactions(p_actor uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with member_groups as (
    select g.id, g.name
    from public.groups g
    join public.group_members gm on gm.group_id = g.id
    where gm.member_id = p_actor and gm.left_at is null and g.archived_at is null
  ), transaction_rows as (
    select
      pt.id, 'personal'::text as source, null::uuid as group_id, null::text as group_name,
      pt.title, pt.event_date, pt.amount_minor, pt.currency::text as currency, pt.direction, pt.kind,
      pt.counterparty, pt.person_id, pt.note, pt.receipt_path, pt.status, pt.settled_amount_minor, pt.settled_at, pt.created_at
    from public.personal_transactions pt
    where pt.user_id = p_actor
    union all
    select
      e.id, 'group'::text, e.group_id, mg.name, e.event_name, e.event_date,
      case when e.paid_by = p_actor then (
        select coalesce(sum(es.amount_minor), 0) from public.expense_shares es where es.expense_id = e.id and es.member_id <> p_actor
      ) else (
        select coalesce(sum(es.amount_minor), 0) from public.expense_shares es where es.expense_id = e.id and es.member_id = p_actor
      ) end,
      e.currency::text, case when e.paid_by = p_actor then 'incoming' else 'outgoing' end, 'expense'::text,
      case when e.paid_by = p_actor then null else payer.display_name end, null::uuid, e.note, e.receipt_path, null::text, null::bigint, null::timestamptz, e.created_at
    from public.expenses e
    join member_groups mg on mg.id = e.group_id
    join public.profiles payer on payer.id = e.paid_by
    where e.reversed_at is null
      and ((e.paid_by = p_actor and exists (select 1 from public.expense_shares es where es.expense_id = e.id and es.member_id <> p_actor and es.amount_minor > 0))
        or (e.paid_by <> p_actor and exists (select 1 from public.expense_shares es where es.expense_id = e.id and es.member_id = p_actor and es.amount_minor > 0)))
    union all
    select
      s.id, 'group'::text, s.group_id, mg.name,
      case when s.confirmation_method = 'claimant_fallback' then 'Payment marked settled by payer' else 'Payment completed' end,
      s.created_at::date, s.amount_minor, s.currency::text,
      case when s.recipient_id = p_actor then 'incoming' else 'outgoing' end, 'payment'::text,
      case when s.recipient_id = p_actor then debtor.display_name else recipient.display_name end, null::uuid,
      coalesce(s.review_note, s.debtor_note), null::text, 'settled'::text, null::bigint, s.reviewed_at, s.created_at
    from public.settlements s
    join member_groups mg on mg.id = s.group_id
    join public.profiles debtor on debtor.id = s.debtor_id
    join public.profiles recipient on recipient.id = s.recipient_id
    where s.status = 'confirmed' and (s.debtor_id = p_actor or s.recipient_id = p_actor)
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', id, 'source', source, 'groupId', group_id, 'groupName', group_name, 'title', title,
    'eventDate', event_date, 'amountMinor', amount_minor, 'currency', currency, 'direction', direction,
    'kind', kind, 'counterparty', counterparty, 'personId', person_id, 'note', note, 'receiptUri', receipt_path,
    'status', status, 'settledAmountMinor', settled_amount_minor, 'settledAt', settled_at, 'createdAt', created_at
  )) order by created_at desc), '[]'::jsonb)
  from transaction_rows;
$$;

revoke all on function public.app_get_transactions(uuid) from public, anon, authenticated;
grant execute on function public.app_get_transactions(uuid) to service_role;

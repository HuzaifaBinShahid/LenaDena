create table public.personal_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  event_date date not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  kind text not null check (kind in ('expense', 'loan')),
  direction text not null check (direction in ('incoming', 'outgoing')),
  counterparty text not null check (char_length(counterparty) between 1 and 80),
  note text check (char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'settled')),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'open' and settled_at is null) or (status = 'settled' and settled_at is not null))
);

create index personal_transactions_user_date_idx on public.personal_transactions(user_id, event_date desc, created_at desc);

alter table public.personal_transactions enable row level security;

create policy personal_transactions_self_select on public.personal_transactions
for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.personal_transactions from anon, authenticated;

create function public.app_create_personal_transaction(p_actor uuid, p_payload jsonb, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  payload_hash text := encode(digest(p_payload::text, 'sha256'), 'hex');
  existing_id uuid;
  new_transaction uuid;
  transaction_kind text := p_payload ->> 'kind';
  transaction_direction text := p_payload ->> 'direction';
begin
  existing_id := private.assert_idempotency(p_actor, p_idempotency_key, 'create_personal_transaction', payload_hash);
  if existing_id is not null then return existing_id; end if;
  if not exists (select 1 from public.profiles where id = p_actor) then raise exception 'profile not found'; end if;
  if transaction_kind not in ('expense', 'loan') then raise exception 'invalid transaction kind'; end if;
  if transaction_direction not in ('incoming', 'outgoing') then raise exception 'invalid transaction direction'; end if;
  if nullif(trim(p_payload ->> 'counterparty'), '') is null then raise exception 'choose who this amount is with'; end if;
  insert into public.personal_transactions (user_id, title, event_date, amount_minor, currency, kind, direction, counterparty, note)
  values (
    p_actor,
    trim(p_payload ->> 'title'),
    (p_payload ->> 'eventDate')::date,
    (p_payload ->> 'amountMinor')::bigint,
    upper(p_payload ->> 'currency'),
    transaction_kind,
    transaction_direction,
    nullif(trim(p_payload ->> 'counterparty'), ''),
    nullif(trim(p_payload ->> 'note'), '')
  )
  returning id into new_transaction;
  insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
  values (p_actor, p_idempotency_key, 'create_personal_transaction', payload_hash, new_transaction);
  return new_transaction;
end;
$$;

create function public.app_settle_personal_transaction(p_actor uuid, p_transaction uuid, p_idempotency_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payload_hash text := encode(digest(p_transaction::text, 'sha256'), 'hex');
  existing_id uuid;
  target public.personal_transactions;
begin
  existing_id := private.assert_idempotency(p_actor, p_idempotency_key, 'settle_personal_transaction', payload_hash);
  if existing_id is not null then return; end if;
  select * into target from public.personal_transactions where id = p_transaction and user_id = p_actor for update;
  if not found then raise exception 'individual entry not found'; end if;
  if target.status = 'open' then
    update public.personal_transactions set status = 'settled', settled_at = now() where id = p_transaction;
  end if;
  insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
  values (p_actor, p_idempotency_key, 'settle_personal_transaction', payload_hash, p_transaction);
end;
$$;

create function public.app_get_transactions(p_actor uuid)
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
      pt.id,
      'personal'::text as source,
      null::uuid as group_id,
      null::text as group_name,
      pt.title,
      pt.event_date,
      pt.amount_minor,
      pt.currency::text as currency,
      pt.direction,
      pt.kind,
      pt.counterparty,
      pt.note,
      pt.status,
      pt.settled_at,
      pt.created_at
    from public.personal_transactions pt
    where pt.user_id = p_actor
    union all
    select
      e.id,
      'group'::text,
      e.group_id,
      mg.name,
      e.event_name,
      e.event_date,
      case when e.paid_by = p_actor then (
        select coalesce(sum(es.amount_minor), 0) from public.expense_shares es where es.expense_id = e.id and es.member_id <> p_actor
      ) else (
        select coalesce(sum(es.amount_minor), 0) from public.expense_shares es where es.expense_id = e.id and es.member_id = p_actor
      ) end,
      e.currency::text,
      case when e.paid_by = p_actor then 'incoming' else 'outgoing' end,
      'expense'::text,
      case when e.paid_by = p_actor then null else payer.display_name end,
      e.note,
      null::text,
      null::timestamptz,
      e.created_at
    from public.expenses e
    join member_groups mg on mg.id = e.group_id
    join public.profiles payer on payer.id = e.paid_by
    where e.reversed_at is null
      and (
        (e.paid_by = p_actor and exists (select 1 from public.expense_shares es where es.expense_id = e.id and es.member_id <> p_actor and es.amount_minor > 0))
        or
        (e.paid_by <> p_actor and exists (select 1 from public.expense_shares es where es.expense_id = e.id and es.member_id = p_actor and es.amount_minor > 0))
      )
    union all
    select
      s.id,
      'group'::text,
      s.group_id,
      mg.name,
      'Payment completed'::text,
      s.created_at::date,
      s.amount_minor,
      s.currency::text,
      case when s.recipient_id = p_actor then 'incoming' else 'outgoing' end,
      'payment'::text,
      case when s.recipient_id = p_actor then debtor.display_name else recipient.display_name end,
      coalesce(s.review_note, s.debtor_note),
      'settled'::text,
      s.reviewed_at,
      s.created_at
    from public.settlements s
    join member_groups mg on mg.id = s.group_id
    join public.profiles debtor on debtor.id = s.debtor_id
    join public.profiles recipient on recipient.id = s.recipient_id
    where s.status = 'confirmed' and (s.debtor_id = p_actor or s.recipient_id = p_actor)
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', id,
    'source', source,
    'groupId', group_id,
    'groupName', group_name,
    'title', title,
    'eventDate', event_date,
    'amountMinor', amount_minor,
    'currency', currency,
    'direction', direction,
    'kind', kind,
    'counterparty', counterparty,
    'note', note,
    'status', status,
    'settledAt', settled_at,
    'createdAt', created_at
  )) order by created_at desc), '[]'::jsonb)
  from transaction_rows;
$$;

revoke all on function public.app_create_personal_transaction(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.app_settle_personal_transaction(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_get_transactions(uuid) from public, anon, authenticated;
grant execute on function public.app_create_personal_transaction(uuid, jsonb, text) to service_role;
grant execute on function public.app_settle_personal_transaction(uuid, uuid, text) to service_role;
grant execute on function public.app_get_transactions(uuid) to service_role;

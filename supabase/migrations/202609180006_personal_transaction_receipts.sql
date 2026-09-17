-- Individual balances keep the private receipt selected for on-device scanning, just like group expenses.
alter table public.personal_transactions
add column receipt_path text;

create or replace function public.app_create_personal_transaction(p_actor uuid, p_payload jsonb, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
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
  insert into public.personal_transactions (user_id, title, event_date, amount_minor, currency, kind, direction, counterparty, note, receipt_path)
  values (
    p_actor,
    trim(p_payload ->> 'title'),
    (p_payload ->> 'eventDate')::date,
    (p_payload ->> 'amountMinor')::bigint,
    upper(p_payload ->> 'currency'),
    transaction_kind,
    transaction_direction,
    nullif(trim(p_payload ->> 'counterparty'), ''),
    nullif(trim(p_payload ->> 'note'), ''),
    nullif(p_payload ->> 'receiptUri', '')
  )
  returning id into new_transaction;
  insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
  values (p_actor, p_idempotency_key, 'create_personal_transaction', payload_hash, new_transaction);
  return new_transaction;
end;
$$;

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
      pt.counterparty, pt.note, pt.receipt_path, pt.status, pt.settled_at, pt.created_at
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
      case when e.paid_by = p_actor then null else payer.display_name end, e.note, e.receipt_path, null::text, null::timestamptz, e.created_at
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
      case when s.recipient_id = p_actor then debtor.display_name else recipient.display_name end,
      coalesce(s.review_note, s.debtor_note), null::text, 'settled'::text, s.reviewed_at, s.created_at
    from public.settlements s
    join member_groups mg on mg.id = s.group_id
    join public.profiles debtor on debtor.id = s.debtor_id
    join public.profiles recipient on recipient.id = s.recipient_id
    where s.status = 'confirmed' and (s.debtor_id = p_actor or s.recipient_id = p_actor)
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', id, 'source', source, 'groupId', group_id, 'groupName', group_name, 'title', title,
    'eventDate', event_date, 'amountMinor', amount_minor, 'currency', currency, 'direction', direction,
    'kind', kind, 'counterparty', counterparty, 'note', note, 'receiptUri', receipt_path, 'status', status,
    'settledAt', settled_at, 'createdAt', created_at
  )) order by created_at desc), '[]'::jsonb)
  from transaction_rows;
$$;

revoke all on function public.app_create_personal_transaction(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.app_get_transactions(uuid) from public, anon, authenticated;
grant execute on function public.app_create_personal_transaction(uuid, jsonb, text) to service_role;
grant execute on function public.app_get_transactions(uuid) to service_role;

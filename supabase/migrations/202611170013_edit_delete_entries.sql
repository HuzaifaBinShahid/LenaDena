-- Editing and deleting expenses and individual balances.
--
-- Group expenses move other people's balances, so the rules are tighter than for private entries:
--   * edit: the person who added the expense or paid it, while everyone in it is still in the group;
--   * delete: the same people, or the group's owner or admin;
--   * every edit and delete is written to the group's activity feed (no email is sent);
--   * an edited expense carries `updated_at`, which the app shows as "Edited".
-- A deleted expense is removed for good (its shares go with it) and so is its receipt photo; the activity event keeps
-- only its name and amount. The old `reversed_at` column stays unused.
--
-- Individual balances are private to their owner: they can change everything, except that once a payment is recorded
-- the amount must stay above what has been paid and the direction and currency are locked.
--
-- Storage files are removed by the API after these functions succeed. The functions return the path of a receipt
-- photo that may now be removed (in its owner's own folder and referenced by nothing else), or null.
-- Safe to run more than once.

alter table public.expenses add column if not exists updated_at timestamptz;

create or replace function private.orphaned_receipt(p_path text, p_owners uuid[])
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_path is null or p_path = '' then null
    when not exists (select 1 from unnest(p_owners) owner_id where strpos(p_path, concat(owner_id::text, '/')) = 1) then null
    when exists (select 1 from public.expenses where receipt_path = p_path) then null
    when exists (select 1 from public.personal_transactions where receipt_path = p_path) then null
    else p_path
  end;
$$;


-- ---------------------------------------------------------------------------------------------------------------
-- One expense in full, for the edit screen. Anyone in the group may read it; `canEdit` / `canDelete` say what the
-- caller may do, and `editBlockedReason` says why not ('not_yours' or 'member_left').
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_get_expense(p_actor uuid, p_expense uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  e public.expenses;
  mine boolean;
  blocked text;
begin
  select * into e from public.expenses where id = p_expense and reversed_at is null;
  if not found or not private.is_group_member(e.group_id, p_actor) then raise exception 'expense_not_found'; end if;
  mine := e.created_by = p_actor or e.paid_by = p_actor;
  blocked := case
    when not mine then 'not_yours'
    when not private.is_group_member(e.group_id, e.paid_by)
      or exists (select 1 from public.expense_shares es where es.expense_id = e.id and not private.is_group_member(e.group_id, es.member_id))
      then 'member_left'
  end;
  return jsonb_strip_nulls(jsonb_build_object(
    'id', e.id,
    'groupId', e.group_id,
    'eventName', e.event_name,
    'eventDate', e.event_date,
    'note', e.note,
    'amountMinor', e.amount_minor,
    'currency', e.currency,
    'paidByMemberId', e.paid_by,
    'splitMethod', e.split_method,
    'receiptPath', e.receipt_path,
    'createdAt', e.created_at,
    'editedAt', e.updated_at,
    'canEdit', blocked is null,
    'editBlockedReason', blocked,
    'canDelete', mine or private.is_group_admin(e.group_id, p_actor),
    'shares', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'memberId', es.member_id, 'amountMinor', es.amount_minor, 'percentageBasisPoints', es.percentage_basis_points
      )) order by es.member_id)
      from public.expense_shares es where es.expense_id = e.id
    ), '[]'::jsonb)
  ));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Edit an expense. The payload carries the new name, date, note, amount, split method and shares, like creating one.
-- `receiptUri` is three-way: absent keeps the photo, null removes it, a storage path in the caller's own folder
-- replaces it. The group and the payer never change.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_update_expense(p_actor uuid, p_expense uuid, p_payload jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  payload_hash text := encode(digest(p_payload::text || p_expense::text, 'sha256'), 'hex');
  existing_id uuid;
  e public.expenses;
  actor_name text;
  total_shares bigint;
  total_basis integer;
  old_receipt text;
  new_receipt text;
begin
  existing_id := private.assert_idempotency(p_actor, p_idempotency_key, 'update_expense', payload_hash);
  if existing_id is not null then return jsonb_build_object('id', existing_id); end if;
  select * into e from public.expenses where id = p_expense and reversed_at is null for update;
  if not found or not private.is_group_member(e.group_id, p_actor) then raise exception 'expense_not_found'; end if;
  if e.created_by <> p_actor and e.paid_by <> p_actor then raise exception 'not_allowed'; end if;
  if not private.is_group_member(e.group_id, e.paid_by)
    or exists (select 1 from public.expense_shares es where es.expense_id = e.id and not private.is_group_member(e.group_id, es.member_id))
  then raise exception 'participant_left'; end if;
  select coalesce(sum((share ->> 'amountMinor')::bigint), 0), coalesce(sum((share ->> 'percentageBasisPoints')::integer), 0)
  into total_shares, total_basis
  from jsonb_array_elements(p_payload -> 'shares') share;
  if (p_payload ->> 'amountMinor')::bigint <= 0 then raise exception 'invalid_amount'; end if;
  if total_shares <> (p_payload ->> 'amountMinor')::bigint then raise exception 'shares must equal amount'; end if;
  if p_payload ->> 'splitMethod' = 'percentage' and total_basis <> 10000 then raise exception 'percentages must equal 100 percent'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload -> 'shares') share
    where not private.is_group_member(e.group_id, (share ->> 'memberId')::uuid)
  ) then raise exception 'participant must be a group member'; end if;
  old_receipt := e.receipt_path;
  if p_payload ? 'receiptUri' then
    new_receipt := nullif(p_payload ->> 'receiptUri', '');
    if new_receipt is not null and strpos(new_receipt, concat(p_actor::text, '/')) <> 1 then raise exception 'invalid_receipt_path'; end if;
  else
    new_receipt := old_receipt;
  end if;
  update public.expenses
  set event_name = p_payload ->> 'eventName',
      event_date = (p_payload ->> 'eventDate')::date,
      note = nullif(p_payload ->> 'note', ''),
      amount_minor = (p_payload ->> 'amountMinor')::bigint,
      split_method = (p_payload ->> 'splitMethod')::public.split_method,
      receipt_path = new_receipt,
      updated_at = now()
  where id = e.id;
  delete from public.expense_shares where expense_id = e.id;
  insert into public.expense_shares (expense_id, member_id, amount_minor, percentage_basis_points)
  select e.id, (share ->> 'memberId')::uuid, (share ->> 'amountMinor')::bigint, nullif(share ->> 'percentageBasisPoints', '')::integer
  from jsonb_array_elements(p_payload -> 'shares') share;
  select display_name into actor_name from public.profiles where id = p_actor;
  insert into public.activity_events (group_id, actor_id, kind, title, detail, tone)
  values (e.group_id, p_actor, 'expense_updated', left(p_payload ->> 'eventName', 160),
    left(concat(actor_name, ' edited this expense. It is now ', trim_scale((p_payload ->> 'amountMinor')::numeric / 100), ' ', e.currency), 300),
    'neutral');
  insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
  values (p_actor, p_idempotency_key, 'update_expense', payload_hash, e.id);
  return jsonb_build_object('id', e.id, 'previousReceiptPath',
    case when old_receipt is distinct from new_receipt then private.orphaned_receipt(old_receipt, array[e.created_by, e.paid_by, p_actor]) end);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Delete an expense: the person who added or paid it, or the group's owner or admin. Payments stay as they are.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_delete_expense(p_actor uuid, p_expense uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e public.expenses;
  actor_name text;
begin
  select * into e from public.expenses where id = p_expense and reversed_at is null for update;
  if not found or not private.is_group_member(e.group_id, p_actor) then raise exception 'expense_not_found'; end if;
  if e.created_by <> p_actor and e.paid_by <> p_actor and not private.is_group_admin(e.group_id, p_actor) then raise exception 'not_allowed'; end if;
  delete from public.expenses where id = e.id;
  select display_name into actor_name from public.profiles where id = p_actor;
  insert into public.activity_events (group_id, actor_id, kind, title, detail, tone)
  values (e.group_id, p_actor, 'expense_deleted', left(e.event_name, 160),
    left(concat(actor_name, ' deleted this expense. It was ', trim_scale(e.amount_minor::numeric / 100), ' ', e.currency), 300),
    'warning');
  return jsonb_build_object('receiptPath', private.orphaned_receipt(e.receipt_path, array[e.created_by, e.paid_by, p_actor]));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Edit an individual balance. Same payload as creating one; `receiptUri` is three-way as above.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_update_personal_transaction(p_actor uuid, p_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  t public.personal_transactions;
  new_kind text := p_payload ->> 'kind';
  new_direction text := p_payload ->> 'direction';
  new_currency text := upper(p_payload ->> 'currency');
  new_amount bigint := (p_payload ->> 'amountMinor')::bigint;
  requested_person uuid := nullif(p_payload ->> 'personId', '')::uuid;
  counterparty_name text := nullif(trim(p_payload ->> 'counterparty'), '');
  linked_person uuid;
  old_receipt text;
  new_receipt text;
begin
  select * into t from public.personal_transactions where id = p_id and user_id = p_actor for update;
  if not found then raise exception 'entry_not_found'; end if;
  if new_kind not in ('expense', 'loan') then raise exception 'invalid transaction kind'; end if;
  if new_direction not in ('incoming', 'outgoing') then raise exception 'invalid transaction direction'; end if;
  if new_amount is null or new_amount <= 0 then raise exception 'invalid_amount'; end if;
  if t.settled_amount_minor > 0 then
    if new_direction <> t.direction or new_currency <> t.currency then raise exception 'entry_has_payments'; end if;
    if t.status = 'settled' and new_amount <> t.amount_minor then raise exception 'entry_settled'; end if;
    if t.status = 'open' and new_amount <= t.settled_amount_minor then raise exception 'amount_below_paid'; end if;
  end if;
  if requested_person is not null then
    select p.id, p.name into linked_person, counterparty_name
    from public.people p
    where p.id = requested_person and p.owner_id = p_actor;
    if linked_person is null then raise exception 'person_not_found'; end if;
  else
    if counterparty_name is null then raise exception 'choose who this amount is with'; end if;
    linked_person := private.find_or_create_person(p_actor, counterparty_name);
    select p.name into counterparty_name from public.people p where p.id = linked_person;
  end if;
  old_receipt := t.receipt_path;
  if p_payload ? 'receiptUri' then
    new_receipt := nullif(p_payload ->> 'receiptUri', '');
    if new_receipt is not null and strpos(new_receipt, concat(p_actor::text, '/')) <> 1 then raise exception 'invalid_receipt_path'; end if;
  else
    new_receipt := old_receipt;
  end if;
  update public.personal_transactions
  set title = trim(p_payload ->> 'title'),
      event_date = (p_payload ->> 'eventDate')::date,
      amount_minor = new_amount,
      currency = new_currency,
      kind = new_kind,
      direction = new_direction,
      counterparty = counterparty_name,
      person_id = linked_person,
      note = nullif(trim(p_payload ->> 'note'), ''),
      receipt_path = new_receipt
  where id = t.id;
  return jsonb_build_object('id', t.id, 'previousReceiptPath',
    case when old_receipt is distinct from new_receipt then private.orphaned_receipt(old_receipt, array[p_actor]) end);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Delete an individual balance, with the payments recorded on it.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_delete_personal_transaction(p_actor uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  t public.personal_transactions;
begin
  select * into t from public.personal_transactions where id = p_id and user_id = p_actor for update;
  if not found then raise exception 'entry_not_found'; end if;
  delete from public.personal_transactions where id = t.id;
  return jsonb_build_object('receiptPath', private.orphaned_receipt(t.receipt_path, array[p_actor]));
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Each transaction row now says whether the caller may edit or delete it, and when an expense was last edited.
-- (Same function as 202611030009, plus canEdit, canDelete and editedAt.)
-- ---------------------------------------------------------------------------------------------------------------
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
      pt.counterparty, pt.person_id, pt.note, pt.receipt_path, pt.status, pt.settled_amount_minor, pt.settled_at, pt.created_at,
      true as can_edit, true as can_delete, null::timestamptz as edited_at
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
      case when e.paid_by = p_actor then null else payer.display_name end, null::uuid, e.note, e.receipt_path, null::text, null::bigint, null::timestamptz, e.created_at,
      (e.created_by = p_actor or e.paid_by = p_actor),
      (e.created_by = p_actor or e.paid_by = p_actor or private.is_group_admin(e.group_id, p_actor)),
      e.updated_at
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
      coalesce(s.review_note, s.debtor_note), null::text, 'settled'::text, null::bigint, s.reviewed_at, s.created_at,
      false, false, null::timestamptz
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
    'status', status, 'settledAmountMinor', settled_amount_minor, 'settledAt', settled_at, 'createdAt', created_at,
    'canEdit', can_edit, 'canDelete', can_delete, 'editedAt', edited_at
  )) order by created_at desc), '[]'::jsonb)
  from transaction_rows;
$$;

-- The activity feed shows the new event kinds with the expense icon. (Same function as 202609130004.)
create or replace function public.app_get_plan(p_actor uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with member_groups as (
    select g.*, gm.role
    from public.groups g
    join public.group_members gm on gm.group_id = g.id
    where gm.member_id = p_actor and gm.left_at is null and g.archived_at is null
  ), expense_effects as (
    select e.group_id,
      sum(case
        when e.paid_by = p_actor and es.member_id <> p_actor then es.amount_minor
        when es.member_id = p_actor and e.paid_by <> p_actor then -es.amount_minor
        else 0
      end)::bigint as amount
    from public.expenses e
    join public.expense_shares es on es.expense_id = e.id
    where e.group_id in (select id from member_groups) and e.reversed_at is null
    group by e.group_id
  ), settlement_effects as (
    select s.group_id,
      sum(case when s.debtor_id = p_actor then s.amount_minor when s.recipient_id = p_actor then -s.amount_minor else 0 end)::bigint as amount
    from public.settlements s
    where s.group_id in (select id from member_groups) and s.status = 'confirmed'
    group by s.group_id
  ), balances as (
    select mg.id, coalesce(ee.amount, 0) + coalesce(se.amount, 0) as amount
    from member_groups mg
    left join expense_effects ee on ee.group_id = mg.id
    left join settlement_effects se on se.group_id = mg.id
  )
  select jsonb_build_object(
    'user', jsonb_strip_nulls(jsonb_build_object('id', p.id, 'name', p.display_name, 'email', p.email, 'avatarUrl', p.avatar_path, 'createdAt', p.created_at)),
    'totals', coalesce((select jsonb_agg(jsonb_build_object(
      'currency', currency,
      'oweMinor', owe_minor,
      'owedMinor', owed_minor
    ) order by currency) from (
      select mg.currency,
        sum(greatest(0, -b.amount))::bigint as owe_minor,
        sum(greatest(0, b.amount))::bigint as owed_minor
      from balances b
      join member_groups mg on mg.id = b.id
      group by mg.currency
    ) currency_totals), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
      'id', mg.id,
      'name', mg.name,
      'currency', mg.currency,
      'accent', mg.accent,
      'balanceMinor', b.amount,
      'role', mg.role,
      'members', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', mp.id, 'name', mp.display_name, 'email', mp.email, 'avatarUrl', mp.avatar_path)) order by mp.display_name)
        from public.group_members mm join public.profiles mp on mp.id = mm.member_id
        where mm.group_id = mg.id and mm.left_at is null), '[]'::jsonb)
    ) order by mg.created_at desc) from member_groups mg join balances b on b.id = mg.id), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', s.id,
      'groupId', s.group_id,
      'debtor', jsonb_strip_nulls(jsonb_build_object('id', dp.id, 'name', dp.display_name, 'email', dp.email, 'avatarUrl', dp.avatar_path)),
      'recipient', jsonb_strip_nulls(jsonb_build_object('id', rp.id, 'name', rp.display_name, 'email', rp.email, 'avatarUrl', rp.avatar_path)),
      'amountMinor', s.amount_minor,
      'currency', s.currency,
      'status', s.status,
      'proofUri', s.proof_path,
      'note', s.debtor_note,
      'confirmationMethod', s.confirmation_method,
      'createdAt', s.created_at
    )) order by s.created_at desc)
    from public.settlements s join public.profiles dp on dp.id = s.debtor_id join public.profiles rp on rp.id = s.recipient_id
    where s.recipient_id = p_actor and s.status = 'awaiting_review'), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', s.id,
      'groupId', s.group_id,
      'debtor', jsonb_strip_nulls(jsonb_build_object('id', dp.id, 'name', dp.display_name, 'email', dp.email, 'avatarUrl', dp.avatar_path)),
      'recipient', jsonb_strip_nulls(jsonb_build_object('id', rp.id, 'name', rp.display_name, 'email', rp.email, 'avatarUrl', rp.avatar_path)),
      'amountMinor', s.amount_minor,
      'currency', s.currency,
      'status', s.status,
      'proofUri', s.proof_path,
      'note', s.debtor_note,
      'recipientHasOpenedApp', rp.last_seen_at is not null,
      'canSelfSettle', rp.last_seen_at is null or now() >= s.created_at + interval '72 hours',
      'selfSettleAvailableAt', case when rp.last_seen_at is null then s.created_at else s.created_at + interval '72 hours' end,
      'createdAt', s.created_at
    )) order by s.created_at desc)
    from public.settlements s join public.profiles dp on dp.id = s.debtor_id join public.profiles rp on rp.id = s.recipient_id
    where s.debtor_id = p_actor and s.status = 'awaiting_review'), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(item order by item ->> 'createdAt' desc) from (
      select jsonb_build_object(
        'id', a.id,
        'icon', case a.kind when 'expense_created' then 'file-text' when 'expense_updated' then 'file-text' when 'expense_deleted' then 'file-text' when 'payment_claimed' then 'send' when 'payment_confirmed' then 'check-circle' when 'payment_self_confirmed' then 'check-circle' when 'payment_needs_attention' then 'alert-circle' else 'users' end,
        'title', a.title,
        'detail', a.detail,
        'createdAt', a.created_at,
        'tone', a.tone
      ) as item
      from public.activity_events a
      where a.group_id in (select id from member_groups)
      order by a.created_at desc limit 50
    ) activity_items), '[]'::jsonb)
  )
  from public.profiles p
  where p.id = p_actor;
$$;

revoke all on function private.orphaned_receipt(text, uuid[]) from public, anon, authenticated;
revoke all on function public.app_get_expense(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_update_expense(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.app_delete_expense(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_update_personal_transaction(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.app_delete_personal_transaction(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_get_transactions(uuid) from public, anon, authenticated;
revoke all on function public.app_get_plan(uuid) from public, anon, authenticated;
grant execute on function public.app_get_expense(uuid, uuid) to service_role;
grant execute on function public.app_update_expense(uuid, uuid, jsonb, text) to service_role;
grant execute on function public.app_delete_expense(uuid, uuid) to service_role;
grant execute on function public.app_update_personal_transaction(uuid, uuid, jsonb) to service_role;
grant execute on function public.app_delete_personal_transaction(uuid, uuid) to service_role;
grant execute on function public.app_get_transactions(uuid) to service_role;
grant execute on function public.app_get_plan(uuid) to service_role;

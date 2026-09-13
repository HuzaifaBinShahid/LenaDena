alter table public.profiles
add column avatar_path text,
add column last_seen_at timestamptz;

alter table public.settlements
add column confirmed_by uuid references public.profiles(id),
add column confirmation_method text check (confirmation_method in ('recipient_review', 'claimant_fallback'));

update public.settlements
set confirmed_by = recipient_id,
    confirmation_method = 'recipient_review'
where status = 'confirmed' and confirmation_method is null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function public.app_touch_profile(p_actor uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_seen_at = now() where id = p_actor;
$$;

create function public.app_update_profile(p_actor uuid, p_name text, p_avatar_path text, p_update_avatar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := nullif(trim(p_name), '');
begin
  if clean_name is null or char_length(clean_name) > 80 then raise exception 'enter a valid profile name'; end if;
  if p_update_avatar and p_avatar_path is not null and strpos(p_avatar_path, concat(p_actor::text, '/')) <> 1 then raise exception 'invalid avatar path'; end if;
  update public.profiles
  set display_name = clean_name,
      avatar_path = case when p_update_avatar then p_avatar_path else avatar_path end,
      updated_at = now()
  where id = p_actor;
  if not found then raise exception 'profile not found'; end if;
end;
$$;

create or replace function public.app_review_settlement(p_actor uuid, p_settlement uuid, p_decision text, p_note text, p_idempotency_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payload_hash text := encode(digest(concat_ws('|', p_settlement, p_decision, p_note), 'sha256'), 'hex');
  existing_id uuid;
  target public.settlements;
begin
  existing_id := private.assert_idempotency(p_actor, p_idempotency_key, 'review_settlement', payload_hash);
  if existing_id is not null then return; end if;
  select * into target from public.settlements where id = p_settlement for update;
  if not found then raise exception 'settlement not found'; end if;
  if target.recipient_id <> p_actor then raise exception 'only the recipient can review this payment'; end if;
  if target.status <> 'awaiting_review' then raise exception 'payment has already been reviewed'; end if;
  if p_decision not in ('confirmed', 'needs_attention') then raise exception 'invalid review decision'; end if;
  update public.settlements
  set status = p_decision::public.settlement_status,
      review_note = nullif(p_note, ''),
      reviewed_at = now(),
      confirmed_by = case when p_decision = 'confirmed' then p_actor else null end,
      confirmation_method = case when p_decision = 'confirmed' then 'recipient_review' else null end
  where id = p_settlement;
  insert into public.activity_events (group_id, actor_id, kind, title, detail, tone)
  values (target.group_id, p_actor, concat('payment_', p_decision), case when p_decision = 'confirmed' then 'Payment confirmed' else 'Payment needs attention' end, concat(target.amount_minor::numeric / 100, ' ', target.currency), case when p_decision = 'confirmed' then 'positive' else 'warning' end);
  insert into public.notification_outbox (recipient_id, group_id, event_type, payload)
  values (target.debtor_id, target.group_id, concat('payment_', p_decision), jsonb_build_object('settlementId', p_settlement));
  insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
  values (p_actor, p_idempotency_key, 'review_settlement', payload_hash, p_settlement);
end;
$$;

create function public.app_self_confirm_settlement(p_actor uuid, p_settlement uuid, p_idempotency_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payload_hash text := encode(digest(p_settlement::text, 'sha256'), 'hex');
  existing_id uuid;
  target public.settlements;
  recipient_last_seen_at timestamptz;
  available_at timestamptz;
begin
  existing_id := private.assert_idempotency(p_actor, p_idempotency_key, 'self_confirm_settlement', payload_hash);
  if existing_id is not null then return; end if;
  select * into target from public.settlements where id = p_settlement for update;
  if not found then raise exception 'settlement not found'; end if;
  if target.debtor_id <> p_actor then raise exception 'only the payer can use fallback settlement'; end if;
  if target.status <> 'awaiting_review' then raise exception 'payment has already been resolved'; end if;
  select last_seen_at into recipient_last_seen_at from public.profiles where id = target.recipient_id;
  available_at := case when recipient_last_seen_at is null then target.created_at else target.created_at + interval '72 hours' end;
  if now() < available_at then raise exception 'recipient review window is open until %', available_at; end if;
  update public.settlements
  set status = 'confirmed',
      review_note = 'Marked settled by payer after recipient fallback',
      reviewed_at = now(),
      confirmed_by = p_actor,
      confirmation_method = 'claimant_fallback'
  where id = p_settlement;
  insert into public.activity_events (group_id, actor_id, kind, title, detail, tone)
  values (target.group_id, p_actor, 'payment_self_confirmed', 'Payment marked settled by payer', concat(target.amount_minor::numeric / 100, ' ', target.currency), 'warning');
  insert into public.notification_outbox (recipient_id, group_id, event_type, payload)
  values (target.recipient_id, target.group_id, 'payment_self_confirmed', jsonb_build_object('settlementId', p_settlement, 'amountMinor', target.amount_minor, 'currency', target.currency));
  insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
  values (p_actor, p_idempotency_key, 'self_confirm_settlement', payload_hash, p_settlement);
end;
$$;

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
        'icon', case a.kind when 'expense_created' then 'file-text' when 'payment_claimed' then 'send' when 'payment_confirmed' then 'check-circle' when 'payment_self_confirmed' then 'check-circle' when 'payment_needs_attention' then 'alert-circle' else 'users' end,
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
      case when s.confirmation_method = 'claimant_fallback' then 'Payment marked settled by payer' else 'Payment completed' end,
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

revoke all on function public.app_touch_profile(uuid) from public, anon, authenticated;
revoke all on function public.app_update_profile(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.app_self_confirm_settlement(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_touch_profile(uuid) to service_role;
grant execute on function public.app_update_profile(uuid, text, text, boolean) to service_role;
grant execute on function public.app_self_confirm_settlement(uuid, uuid, text) to service_role;

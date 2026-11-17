-- Push notifications through Firebase Cloud Messaging: the device tokens people choose to register, reminders ("nudges")
-- to someone who owes you in a group, and the push for an invitation to an account.
--
--   * A token is a device identifier: it is stored only when the person switches "Reminders from friends" on, removed when
--     they switch it off or sign out, reassigned if another account signs in on the same phone, and deleted with the
--     account (app_delete_account below). The export lists the devices (platform and date), never the tokens.
--   * A reminder needs the money to be really owed (private.pair_balance), is limited to one per person per group per
--     24 hours and 15 a day, and is only recorded when the person has a device to receive it. The API undoes the record
--     if delivery fails completely, so a flaky send does not use up the day.
--   * The API (not these functions) talks to Firebase; the functions only hold the data and the rules.
-- Safe to run more than once.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique check (char_length(token) between 20 and 4096),
  platform text not null check (platform in ('android', 'ios', 'web')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;

create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists nudges_pair_idx on public.nudges (sender_id, recipient_id, group_id, created_at desc);
create index if not exists nudges_created_idx on public.nudges (created_at);
alter table public.nudges enable row level security;
revoke all on public.nudges from anon, authenticated;


-- ---------------------------------------------------------------------------------------------------------------
-- Register this phone to receive pushes. The same token seen again (a refresh, or another account signing in on the
-- phone) moves to the caller. At most 10 devices per person: the one being registered and the nine most recently seen.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_register_push_token(p_actor uuid, p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = p_actor and deleted_at is null) then raise exception 'profile_not_found'; end if;
  if p_platform is null or p_platform not in ('android', 'ios', 'web') then raise exception 'invalid_platform'; end if;
  if char_length(coalesce(p_token, '')) not between 20 and 4096 then raise exception 'invalid_token'; end if;
  insert into public.push_tokens (user_id, token, platform) values (p_actor, p_token, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
  -- The token just registered always stays; of the person's other devices the nine most recently seen stay with it.
  delete from public.push_tokens
  where user_id = p_actor and token <> p_token
    and id not in (select id from public.push_tokens where user_id = p_actor and token <> p_token order by last_seen_at desc, created_at desc limit 9);
end;
$$;

create or replace function public.app_remove_push_token(p_actor uuid, p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens where token = p_token and user_id = p_actor;
$$;

-- For the API, after Firebase says a token no longer exists (the app was uninstalled or the token expired).
create or replace function public.app_drop_push_tokens(p_tokens text[])
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens where token = any(p_tokens);
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- A reminder to someone who owes the caller money in a group. Returns what the API needs to send it: the names, the
-- amount, the group and the recipient's device tokens. Nothing is recorded when the recipient has no device.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_create_nudge(p_actor uuid, p_group uuid, p_member uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  owed bigint;
  g public.groups;
  sender text;
  recipient text;
  device_tokens jsonb;
  nudge uuid;
begin
  -- Reminder records only exist to enforce the daily limits, so anything older than a week is dropped (the privacy
  -- policy says "about a week"). Any reminder that is asked for tidies up for everyone.
  delete from public.nudges where created_at < now() - interval '7 days';
  if not private.is_group_member(p_group, p_actor) then raise exception 'group_not_found'; end if;
  select * into g from public.groups where id = p_group;
  if g.archived_at is not null then raise exception 'group_not_found'; end if;
  if p_member = p_actor then raise exception 'cannot_nudge_yourself'; end if;
  if not private.is_group_member(p_group, p_member) then raise exception 'member_not_found'; end if;
  owed := private.pair_balance(p_group, p_actor, p_member);
  if owed <= 0 then raise exception 'nothing_owed'; end if;
  if exists (
    select 1 from public.nudges n
    where n.sender_id = p_actor and n.recipient_id = p_member and n.group_id = p_group and n.created_at > now() - interval '24 hours'
  ) then raise exception 'nudge_cooldown'; end if;
  if (select count(*) from public.nudges n where n.sender_id = p_actor and n.created_at > now() - interval '24 hours') >= 15 then
    raise exception 'nudge_limit_reached';
  end if;
  select display_name into sender from public.profiles where id = p_actor;
  select display_name into recipient from public.profiles where id = p_member;
  select coalesce(jsonb_agg(t.token order by t.last_seen_at desc), '[]'::jsonb) into device_tokens from public.push_tokens t where t.user_id = p_member;
  if jsonb_array_length(device_tokens) > 0 then
    insert into public.nudges (group_id, sender_id, recipient_id) values (p_group, p_actor, p_member) returning id into nudge;
  end if;
  return jsonb_build_object('nudgeId', nudge, 'recipientName', recipient, 'senderName', sender, 'amountMinor', owed,
    'currency', g.currency, 'groupId', p_group, 'groupName', g.name, 'tokens', device_tokens);
end;
$$;

create or replace function public.app_undo_nudge(p_actor uuid, p_nudge uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.nudges where id = p_nudge and sender_id = p_actor;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Who to push when an invitation was just sent to an address: only for an invitation the caller sent in the last five
-- minutes, to an account that is not in the group yet and has a device. The caller is never told whether this found
-- anyone, so it cannot be used to learn who has an account.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_get_invitation_push_target(p_actor uuid, p_group uuid, p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  target uuid;
  device_tokens jsonb;
begin
  if not private.is_group_member(p_group, p_actor) then return null; end if;
  if not exists (
    select 1 from public.group_invites i
    where i.group_id = p_group and i.invited_by = p_actor and lower(i.email) = v_email
      and i.accepted_at is null and i.revoked_at is null and i.created_at > now() - interval '5 minutes'
  ) then return null; end if;
  select p.id into target from public.profiles p where lower(p.email) = v_email and p.deleted_at is null limit 1;
  if target is null or private.is_group_member(p_group, target) then return null; end if;
  select coalesce(jsonb_agg(t.token order by t.last_seen_at desc), '[]'::jsonb) into device_tokens from public.push_tokens t where t.user_id = target;
  if jsonb_array_length(device_tokens) = 0 then return null; end if;
  return jsonb_build_object(
    'tokens', device_tokens,
    'inviterName', (select display_name from public.profiles where id = p_actor),
    'groupName', (select name from public.groups where id = p_group),
    'groupId', p_group
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- The export now lists the devices registered for notifications (platform and date, never the token).
-- (Same function as 202611170014, plus notificationDevices.)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_export_data(p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where id = p_actor and deleted_at is null;
  if not found then raise exception 'profile_not_found'; end if;
  return jsonb_build_object(
    'format', 'lenadena-export',
    'version', 1,
    'exportedAt', now(),
    'account', jsonb_strip_nulls(jsonb_build_object(
      'name', me.display_name, 'email', me.email, 'createdAt', me.created_at, 'lastSeenAt', me.last_seen_at,
      'emailTone', me.email_tone, 'theme', me.theme
    )),
    'groups', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'name', g.name, 'currency', g.currency, 'role', gm.role, 'joinedAt', gm.joined_at, 'leftAt', gm.left_at,
        'archived', g.archived_at is not null,
        'members', coalesce((
          select jsonb_agg(jsonb_build_object('name', mp.display_name) order by mp.display_name)
          from public.group_members mm join public.profiles mp on mp.id = mm.member_id
          where mm.group_id = g.id and mm.left_at is null
        ), '[]'::jsonb)
      )) order by g.created_at)
      from public.group_members gm join public.groups g on g.id = gm.group_id
      where gm.member_id = p_actor
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'group', g.name, 'title', e.event_name, 'date', e.event_date, 'amountMinor', e.amount_minor, 'currency', e.currency,
        'paidBy', payer.display_name, 'paidByMe', e.paid_by = p_actor, 'splitMethod', e.split_method, 'note', e.note,
        'hasReceipt', e.receipt_path is not null, 'createdAt', e.created_at, 'editedAt', e.updated_at,
        'shares', coalesce((
          select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'person', sp.display_name, 'isMe', es.member_id = p_actor, 'amountMinor', es.amount_minor,
            'percentageBasisPoints', es.percentage_basis_points
          )) order by sp.display_name)
          from public.expense_shares es join public.profiles sp on sp.id = es.member_id
          where es.expense_id = e.id
        ), '[]'::jsonb)
      )) order by e.event_date desc, e.created_at desc)
      from public.expenses e
      join public.groups g on g.id = e.group_id
      join public.profiles payer on payer.id = e.paid_by
      where e.reversed_at is null
        and (e.paid_by = p_actor or exists (select 1 from public.expense_shares es2 where es2.expense_id = e.id and es2.member_id = p_actor))
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'group', g.name, 'from', debtor.display_name, 'to', recipient.display_name, 'fromMe', s.debtor_id = p_actor,
        'amountMinor', s.amount_minor, 'currency', s.currency, 'status', s.status, 'note', s.debtor_note,
        'reviewNote', s.review_note, 'hasProof', s.proof_path is not null, 'confirmationMethod', s.confirmation_method,
        'createdAt', s.created_at, 'reviewedAt', s.reviewed_at
      )) order by s.created_at desc)
      from public.settlements s
      join public.groups g on g.id = s.group_id
      join public.profiles debtor on debtor.id = s.debtor_id
      join public.profiles recipient on recipient.id = s.recipient_id
      where s.debtor_id = p_actor or s.recipient_id = p_actor
    ), '[]'::jsonb),
    'individualBalances', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'title', t.title, 'date', t.event_date, 'person', t.counterparty, 'kind', t.kind, 'direction', t.direction,
        'amountMinor', t.amount_minor, 'currency', t.currency, 'paidMinor', t.settled_amount_minor, 'status', t.status,
        'settledAt', t.settled_at, 'note', t.note, 'hasReceipt', t.receipt_path is not null, 'createdAt', t.created_at
      )) order by t.event_date desc, t.created_at desc)
      from public.personal_transactions t where t.user_id = p_actor
    ), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'name', pe.name, 'email', pe.email, 'reminders', pe.reminder_frequency, 'hasPhoto', pe.avatar_path is not null,
        'createdAt', pe.created_at
      )) order by pe.name)
      from public.people pe where pe.owner_id = p_actor
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'group', ev.group_name, 'kind', ev.kind, 'title', ev.title, 'detail', ev.detail, 'createdAt', ev.created_at
      ) order by ev.created_at desc)
      from (
        select g.name as group_name, a.kind, a.title, a.detail, a.created_at
        from public.activity_events a
        join public.groups g on g.id = a.group_id
        join public.group_members gm on gm.group_id = a.group_id and gm.member_id = p_actor and gm.left_at is null
        order by a.created_at desc
        limit 1000
      ) ev
    ), '[]'::jsonb),
    'emails', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'type', o.event_type, 'to', coalesce(o.recipient_email, 'you'), 'createdAt', o.created_at, 'sentAt', o.sent_at
      )) order by o.created_at desc)
      from (
        select event_type, recipient_email, created_at, sent_at
        from public.notification_outbox
        where recipient_id = p_actor or payload ->> 'ownerId' = p_actor::text
        order by created_at desc
        limit 1000
      ) o
    ), '[]'::jsonb),
    'notificationDevices', coalesce((
      select jsonb_agg(jsonb_build_object('platform', t.platform, 'registeredAt', t.created_at) order by t.created_at)
      from public.push_tokens t where t.user_id = p_actor
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Deleting an account also deletes its device tokens and the reminders it sent or received.
-- (Same function as 202611160012, plus those two deletes.)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_delete_account(p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  shared record;
  successor uuid;
begin
  select * into me from public.profiles where id = p_actor for update;
  -- No profile: nothing left to delete, so a retry after a half-finished deletion is harmless.
  if not found then return; end if;

  -- Groups first: they decide which shared records stay.
  for shared in
    select gm.group_id, g.owner_id
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.member_id = p_actor
  loop
    if not exists (select 1 from public.group_members o where o.group_id = shared.group_id and o.member_id <> p_actor) then
      -- Only they were ever in it: nobody else's records are lost by deleting the whole group.
      delete from public.notification_outbox where group_id = shared.group_id;
      delete from public.settlements where group_id = shared.group_id;
      delete from public.expenses where group_id = shared.group_id; -- expense_shares go with their expense
      delete from public.groups where id = shared.group_id;        -- members, invites and activity go with the group
    elsif shared.owner_id = p_actor then
      -- Hand the group to whoever joined first (someone still in the group before anyone who left).
      select o.member_id into successor
      from public.group_members o
      where o.group_id = shared.group_id and o.member_id <> p_actor
      order by (o.left_at is null) desc, o.joined_at asc, o.member_id
      limit 1;
      update public.groups set owner_id = successor where id = shared.group_id;
      update public.group_members set role = 'owner' where group_id = shared.group_id and member_id = successor;
      update public.group_members set role = 'member' where group_id = shared.group_id and member_id = p_actor;
    end if;
  end loop;

  -- The name also sits inside the plain-text activity lines of the groups that stay.
  if char_length(me.display_name) >= 3 and me.display_name <> 'Deleted user' then
    update public.activity_events ae
    set title = left(replace(ae.title, me.display_name, 'Deleted user'), 160),
        detail = left(replace(ae.detail, me.display_name, 'Deleted user'), 300)
    where ae.group_id in (select gm.group_id from public.group_members gm where gm.member_id = p_actor)
      and (strpos(ae.title, me.display_name) > 0 or strpos(ae.detail, me.display_name) > 0);
  end if;

  -- Everything that is only theirs.
  delete from public.push_tokens where user_id = p_actor;
  delete from public.nudges where sender_id = p_actor or recipient_id = p_actor;
  delete from public.personal_transactions where user_id = p_actor;
  delete from public.people where owner_id = p_actor;
  delete from public.idempotency_keys where actor_id = p_actor;
  delete from public.notification_outbox where recipient_id = p_actor or payload ->> 'ownerId' = p_actor::text;
  delete from public.group_invites where accepted_at is null and (invited_by = p_actor or lower(email) = lower(me.email));
  update public.group_invites set email = null where invited_by = p_actor;

  -- What is left of them: a placeholder that other members' records can point at.
  update public.profiles
  set email = concat('deleted-', p_actor::text, '@deleted.invalid'),
      display_name = 'Deleted user',
      avatar_path = null,
      last_seen_at = null,
      deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
  where id = p_actor;
end;
$$;

revoke all on function public.app_register_push_token(uuid, text, text) from public, anon, authenticated;
revoke all on function public.app_remove_push_token(uuid, text) from public, anon, authenticated;
revoke all on function public.app_drop_push_tokens(text[]) from public, anon, authenticated;
revoke all on function public.app_create_nudge(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_undo_nudge(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_get_invitation_push_target(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_export_data(uuid) from public, anon, authenticated;
revoke all on function public.app_delete_account(uuid) from public, anon, authenticated;
grant execute on function public.app_register_push_token(uuid, text, text) to service_role;
grant execute on function public.app_remove_push_token(uuid, text) to service_role;
grant execute on function public.app_drop_push_tokens(text[]) to service_role;
grant execute on function public.app_create_nudge(uuid, uuid, uuid) to service_role;
grant execute on function public.app_undo_nudge(uuid, uuid) to service_role;
grant execute on function public.app_get_invitation_push_target(uuid, uuid, text) to service_role;
grant execute on function public.app_export_data(uuid) to service_role;
grant execute on function public.app_delete_account(uuid) to service_role;

-- Group management: invite by email with an in-app Accept / Decline for people who already have an account, leave a
-- group, remove a member, rename a group, and the member list for the Members screen.
--
-- Consent: nobody is put into a group without saying yes. An invitation by email always behaves the same whether or
-- not that email has an account (an invitation row and an email), so the API cannot be used to find out who has one;
-- when the address belongs to an account, the invitation also shows up inside their app (app_list_invitations).
--
-- Leaving or removing someone needs their balance in the group to be settled and no payment waiting for review, so a
-- debt never disappears from the books. The owner cannot leave while others remain, and cannot be removed.
-- Safe to run more than once.

-- A member's net balance in one group, as app_get_plan computes it: positive = is owed, negative = owes.
create or replace function private.group_balance(p_group uuid, p_member uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select (
    coalesce((
      select sum(case
        when e.paid_by = p_member and es.member_id <> p_member then es.amount_minor
        when es.member_id = p_member and e.paid_by <> p_member then -es.amount_minor
        else 0 end)
      from public.expenses e join public.expense_shares es on es.expense_id = e.id
      where e.group_id = p_group and e.reversed_at is null
    ), 0)
    + coalesce((
      select sum(case when s.debtor_id = p_member then s.amount_minor when s.recipient_id = p_member then -s.amount_minor else 0 end)
      from public.settlements s where s.group_id = p_group and s.status = 'confirmed'
    ), 0)
  )::bigint;
$$;

-- Whether a member can be taken out of a group now: settled, and no payment still waiting for review.
create or replace function private.member_is_settled(p_group uuid, p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.group_balance(p_group, p_member) = 0
    and not exists (
      select 1 from public.settlements s
      where s.group_id = p_group and s.status = 'awaiting_review' and (s.debtor_id = p_member or s.recipient_id = p_member)
    );
$$;

-- What one person owes another in a group, net of what the other owes them and of confirmed payments between the two.
-- Positive: the debtor owes the creditor; zero or negative: they do not. Used for the member list and for reminders.
create or replace function private.pair_balance(p_group uuid, p_creditor uuid, p_debtor uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select (
    coalesce((select sum(es.amount_minor) from public.expenses e join public.expense_shares es on es.expense_id = e.id
      where e.group_id = p_group and e.reversed_at is null and e.paid_by = p_creditor and es.member_id = p_debtor), 0)
    - coalesce((select sum(es.amount_minor) from public.expenses e join public.expense_shares es on es.expense_id = e.id
      where e.group_id = p_group and e.reversed_at is null and e.paid_by = p_debtor and es.member_id = p_creditor), 0)
    - coalesce((select sum(s.amount_minor) from public.settlements s
      where s.group_id = p_group and s.status = 'confirmed' and s.debtor_id = p_debtor and s.recipient_id = p_creditor), 0)
    + coalesce((select sum(s.amount_minor) from public.settlements s
      where s.group_id = p_group and s.status = 'confirmed' and s.debtor_id = p_creditor and s.recipient_id = p_debtor), 0)
  )::bigint;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Invite by email. Any member may (as with link invites). Returns the same link as app_create_invite so the app can
-- offer the share sheet for someone without an account. The email is queued either way.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_invite_member(p_actor uuid, p_group uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  invite_token text := encode(gen_random_bytes(24), 'hex');
  invite_expiry timestamptz := now() + interval '7 days';
begin
  if not private.is_group_member(p_group, p_actor) then raise exception 'group membership required'; end if;
  if char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_email'; end if;
  if exists (
    select 1 from public.profiles p
    join public.group_members gm on gm.member_id = p.id and gm.group_id = p_group and gm.left_at is null
    where lower(p.email) = v_email
  ) then raise exception 'already_member'; end if;
  if exists (
    select 1 from public.group_invites i
    where i.group_id = p_group and lower(i.email) = v_email and i.accepted_at is null and i.revoked_at is null
      and i.expires_at > now() and i.created_at > now() - interval '12 hours'
  ) then raise exception 'already_invited'; end if;
  if (select count(*) from public.group_invites i where i.invited_by = p_actor and i.created_at > now() - interval '24 hours') >= 30 then
    raise exception 'invite_limit_reached';
  end if;
  insert into public.group_invites (group_id, invited_by, email, token_hash, expires_at)
  values (p_group, p_actor, v_email, encode(digest(invite_token, 'sha256'), 'hex'), invite_expiry);
  insert into public.notification_outbox (recipient_email, group_id, event_type, payload)
  values (v_email, p_group, 'group_invite', jsonb_build_object('url', concat('lenadena://invite/', invite_token)));
  return jsonb_build_object('url', concat('lenadena://invite/', invite_token), 'expiresAt', invite_expiry);
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Invitations addressed to the caller's own email, still open, for groups they are not already in.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_list_invitations(p_actor uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'groupId', i.group_id, 'groupName', g.name, 'invitedBy', ip.display_name,
    'createdAt', i.created_at, 'expiresAt', i.expires_at
  ) order by i.created_at desc), '[]'::jsonb)
  from public.group_invites i
  join public.groups g on g.id = i.group_id and g.archived_at is null
  join public.profiles ip on ip.id = i.invited_by
  where i.email is not null
    and lower(i.email) = (select lower(me.email) from public.profiles me where me.id = p_actor and me.deleted_at is null)
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    and not private.is_group_member(i.group_id, p_actor);
$$;

create or replace function public.app_accept_invitation(p_actor uuid, p_invite uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.group_invites;
  actor_email text;
begin
  select lower(email) into actor_email from public.profiles where id = p_actor and deleted_at is null;
  if actor_email is null then raise exception 'profile_not_found'; end if;
  select * into target from public.group_invites where id = p_invite for update;
  if not found or target.email is null or lower(target.email) <> actor_email
    or target.revoked_at is not null or target.expires_at <= now()
    or exists (select 1 from public.groups g where g.id = target.group_id and g.archived_at is not null)
  then raise exception 'invitation_not_found'; end if;
  if target.accepted_at is not null then
    if target.accepted_by = p_actor then return target.group_id; end if;
    raise exception 'invitation_not_found';
  end if;
  insert into public.group_members (group_id, member_id, role, left_at)
  values (target.group_id, p_actor, 'member', null)
  on conflict (group_id, member_id) do update set left_at = null;
  update public.group_invites set accepted_at = now(), accepted_by = p_actor where id = target.id;
  insert into public.activity_events (group_id, actor_id, kind, title, detail, tone)
  select target.group_id, p_actor, 'member_joined', 'Friend joined the group', display_name, 'positive'
  from public.profiles where id = p_actor;
  return target.group_id;
end;
$$;

create or replace function public.app_decline_invitation(p_actor uuid, p_invite uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_email text;
  changed integer;
begin
  select lower(email) into actor_email from public.profiles where id = p_actor and deleted_at is null;
  if actor_email is null then raise exception 'profile_not_found'; end if;
  update public.group_invites set revoked_at = now()
  where id = p_invite and lower(email) = actor_email and accepted_at is null and revoked_at is null;
  get diagnostics changed = row_count;
  if changed = 0 then raise exception 'invitation_not_found'; end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- The Members screen: who is in the group with their role, whether each can be taken out now (settled, nothing waiting
-- for review), what each owes the caller (negative: the caller owes them; only the two of them know that amount), and the
-- invitations still open.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_get_group_people(p_actor uuid, p_group uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_group_member(p_group, p_actor) then raise exception 'group_not_found'; end if;
  return jsonb_build_object(
    'canManage', private.is_group_admin(p_group, p_actor),
    'members', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', p.id, 'name', p.display_name, 'avatarPath', p.avatar_path, 'role', gm.role,
        'settled', private.member_is_settled(p_group, p.id), 'joinedAt', gm.joined_at,
        'owesYouMinor', case when p.id = p_actor then 0 else private.pair_balance(p_group, p_actor, p.id) end
      )) order by (gm.role = 'owner') desc, gm.joined_at, p.display_name)
      from public.group_members gm join public.profiles p on p.id = gm.member_id
      where gm.group_id = p_group and gm.left_at is null
    ), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'email', i.email, 'invitedBy', ip.display_name, 'createdAt', i.created_at, 'expiresAt', i.expires_at
      ) order by i.created_at desc)
      from public.group_invites i join public.profiles ip on ip.id = i.invited_by
      where i.group_id = p_group and i.email is not null and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
        and not exists (
          select 1 from public.profiles pr
          join public.group_members gm2 on gm2.member_id = pr.id and gm2.group_id = p_group and gm2.left_at is null
          where lower(pr.email) = lower(i.email)
        )
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Leave a group. Not while settling is open; the owner stays while others remain; the last person out archives it.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_leave_group(p_actor uuid, p_group uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.group_members;
  others integer;
begin
  select * into m from public.group_members where group_id = p_group and member_id = p_actor and left_at is null for update;
  if not found then raise exception 'group_not_found'; end if;
  select count(*) into others from public.group_members where group_id = p_group and member_id <> p_actor and left_at is null;
  if m.role = 'owner' and others > 0 then raise exception 'owner_cannot_leave'; end if;
  if not private.member_is_settled(p_group, p_actor) then raise exception 'not_settled'; end if;
  update public.group_members set left_at = now() where group_id = p_group and member_id = p_actor;
  if others = 0 then update public.groups set archived_at = coalesce(archived_at, now()) where id = p_group; end if;
  insert into public.activity_events (group_id, actor_id, kind, title, detail, tone)
  select p_group, p_actor, 'member_left', 'Friend left the group', display_name, 'neutral' from public.profiles where id = p_actor;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Remove a member: the owner may remove anyone but themselves; an admin may remove ordinary members. Same settling rule.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_remove_member(p_actor uuid, p_group uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.group_role;
  target public.group_members;
begin
  select role into actor_role from public.group_members where group_id = p_group and member_id = p_actor and left_at is null;
  if actor_role is null then raise exception 'group_not_found'; end if;
  if actor_role not in ('owner', 'admin') then raise exception 'not_allowed'; end if;
  if p_member = p_actor then raise exception 'use_leave'; end if;
  select * into target from public.group_members where group_id = p_group and member_id = p_member and left_at is null for update;
  if not found then raise exception 'member_not_found'; end if;
  if target.role = 'owner' then raise exception 'cannot_remove_owner'; end if;
  if target.role = 'admin' and actor_role <> 'owner' then raise exception 'not_allowed'; end if;
  if not private.member_is_settled(p_group, p_member) then raise exception 'not_settled'; end if;
  update public.group_members set left_at = now() where group_id = p_group and member_id = p_member;
  insert into public.activity_events (group_id, actor_id, kind, title, detail, tone)
  select p_group, p_actor, 'member_removed', 'Friend was removed from the group', display_name, 'warning' from public.profiles where id = p_member;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Rename a group: owner or admin.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_rename_group(p_actor uuid, p_group uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new_name text := trim(coalesce(p_name, ''));
  old_name text;
begin
  if not private.is_group_member(p_group, p_actor) then raise exception 'group_not_found'; end if;
  if not private.is_group_admin(p_group, p_actor) then raise exception 'not_allowed'; end if;
  if char_length(new_name) < 2 or char_length(new_name) > 80 then raise exception 'invalid_group_name'; end if;
  select name into old_name from public.groups where id = p_group for update;
  if old_name = new_name then return; end if;
  update public.groups set name = new_name where id = p_group;
  insert into public.activity_events (group_id, actor_id, kind, title, detail, tone)
  values (p_group, p_actor, 'group_renamed', left(new_name, 160), left(concat('Renamed from ', old_name), 300), 'neutral');
end;
$$;

revoke all on function private.group_balance(uuid, uuid) from public, anon, authenticated;
revoke all on function private.member_is_settled(uuid, uuid) from public, anon, authenticated;
revoke all on function private.pair_balance(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_invite_member(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_list_invitations(uuid) from public, anon, authenticated;
revoke all on function public.app_accept_invitation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_decline_invitation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_get_group_people(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_leave_group(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_remove_member(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_rename_group(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_invite_member(uuid, uuid, text) to service_role;
grant execute on function public.app_list_invitations(uuid) to service_role;
grant execute on function public.app_accept_invitation(uuid, uuid) to service_role;
grant execute on function public.app_decline_invitation(uuid, uuid) to service_role;
grant execute on function public.app_get_group_people(uuid, uuid) to service_role;
grant execute on function public.app_leave_group(uuid, uuid) to service_role;
grant execute on function public.app_remove_member(uuid, uuid, uuid) to service_role;
grant execute on function public.app_rename_group(uuid, uuid, text) to service_role;

-- Account deletion (2026-11-16). Stores require that a person can delete their account from inside the app.
--
-- What deleting an account does, and why it is more than deleting the sign-in:
--   * Deleted: the sign-in itself (email, password, sessions: done by the API through Supabase Auth), the profile's name,
--     email and photo, all individual balances, saved people, their receipts and photos, and anything queued to be
--     emailed to or about them.
--   * Kept, without their identity: group records other members rely on (expenses, shares, settlements, activity).
--     Their profile row stays as "Deleted user" with no email or photo, so everyone else's balances stay right. A
--     group they were the only member of is deleted whole, and a group they owned with other members passes to the
--     member who joined first.
--
-- Why the profiles foreign key goes: profiles.id referenced auth.users with on delete cascade, and expenses, shares,
-- settlements and activity reference profiles without cascade. Deleting the sign-in would therefore either fail for
-- anyone who ever used a group, or erase other people's records. Without that link the sign-in can be deleted for real
-- while the anonymised profile row stays behind.
--
-- Safe to run more than once. Needs 202609180007 (people) for the people table.

do $$
declare
  link record;
begin
  for link in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.profiles drop constraint %I', link.conname);
  end loop;
end
$$;

alter table public.profiles add column if not exists deleted_at timestamptz;

-- The files that belong only to this person and must be removed from storage before their rows go: their photo, the
-- photos of people they saved, and receipts on their individual balances. Receipts and payment proofs on group
-- expenses and settlements stay with the group record. Paths are only returned when they sit in the person's own
-- folder, so a bad path can never point at someone else's file.
create or replace function public.app_account_storage_paths(p_actor uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'avatars', coalesce((
      select jsonb_agg(distinct a.path)
      from (
        select p.avatar_path as path from public.profiles p where p.id = p_actor
        union
        select pe.avatar_path from public.people pe where pe.owner_id = p_actor
      ) a
      where a.path is not null and strpos(a.path, concat(p_actor::text, '/')) = 1
    ), '[]'::jsonb),
    'receipts', coalesce((
      select jsonb_agg(distinct pt.receipt_path)
      from public.personal_transactions pt
      where pt.user_id = p_actor and pt.receipt_path is not null and strpos(pt.receipt_path, concat(p_actor::text, '/')) = 1
    ), '[]'::jsonb)
  );
$$;

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

revoke all on function public.app_account_storage_paths(uuid) from public, anon, authenticated;
revoke all on function public.app_delete_account(uuid) from public, anon, authenticated;
grant execute on function public.app_account_storage_paths(uuid) to service_role;
grant execute on function public.app_delete_account(uuid) to service_role;

-- People: every individual balance names a person from the owner's private list (name required, email and photo
-- optional). A name used again, ignoring case, links to the same person, so their history and balance collect in
-- one place. Owner-private like personal_transactions: all reads and writes go through app_* RPCs run by the API.
-- Self-contained after 202609180006: it repeats 0006's column (guarded) and replaces both functions 0006 touched,
-- so it also works on a database that never ran 0006. Every statement is guarded or idempotent: re-running is harmless.

alter table public.personal_transactions add column if not exists receipt_path text;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  email text check (char_length(email) between 3 and 254),
  avatar_path text check (char_length(avatar_path) between 1 and 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists people_owner_name_key on public.people (owner_id, lower(name));

alter table public.people enable row level security;

drop policy if exists people_self_select on public.people;
create policy people_self_select on public.people
for select to authenticated using (owner_id = auth.uid());

revoke insert, update, delete on public.people from anon, authenticated;

-- Deleting a person keeps their entries (and counterparty text); the foreign key only clears the link.
alter table public.personal_transactions
add column if not exists person_id uuid references public.people(id) on delete set null;

create index if not exists personal_transactions_person_idx on public.personal_transactions(person_id);

-- Backfill: one person per owner and name (trimmed, ignoring case), shown with the most recently used spelling and
-- dated from the first entry with them. Linked entries then read the person's name.
insert into public.people (owner_id, name, created_at, updated_at)
select distinct on (pt.user_id, lower(trim(pt.counterparty)))
  pt.user_id,
  trim(pt.counterparty),
  min(pt.created_at) over (partition by pt.user_id, lower(trim(pt.counterparty))),
  now()
from public.personal_transactions pt
where nullif(trim(pt.counterparty), '') is not null
order by pt.user_id, lower(trim(pt.counterparty)), pt.created_at desc, pt.id desc
on conflict (owner_id, (lower(name))) do nothing;

update public.personal_transactions pt
set person_id = p.id,
    counterparty = p.name
from public.people p
where pt.person_id is null
  and p.owner_id = pt.user_id
  and lower(p.name) = lower(trim(pt.counterparty));

-- Links the owner's unlinked entries that already use this person's name (a new person, or one added again after
-- being deleted). Linked entries always read the person's current name.
create or replace function private.link_person_transactions(p_actor uuid, p_person uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.personal_transactions pt
  set person_id = p.id,
      counterparty = p.name
  from public.people p
  where p.id = p_person
    and p.owner_id = p_actor
    and pt.user_id = p_actor
    and pt.person_id is null
    and lower(trim(pt.counterparty)) = lower(p.name);
$$;

create or replace function private.find_or_create_person(p_actor uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := nullif(trim(p_name), '');
  found_person uuid;
begin
  if clean_name is null or char_length(clean_name) > 80 then raise exception 'invalid_person_name'; end if;
  select id into found_person from public.people where owner_id = p_actor and lower(name) = lower(clean_name);
  if found_person is not null then return found_person; end if;
  insert into public.people (owner_id, name)
  values (p_actor, clean_name)
  on conflict (owner_id, (lower(name))) do nothing
  returning id into found_person;
  if found_person is null then
    -- A concurrent request added this person first.
    select id into found_person from public.people where owner_id = p_actor and lower(name) = lower(clean_name);
  else
    perform private.link_person_transactions(p_actor, found_person);
  end if;
  return found_person;
end;
$$;

create or replace function public.app_get_people(p_actor uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'email', p.email,
    'avatarPath', p.avatar_path,
    'createdAt', p.created_at
  )) order by lower(p.name), p.id), '[]'::jsonb)
  from public.people p
  where p.owner_id = p_actor;
$$;

create or replace function public.app_create_person(p_actor uuid, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := nullif(trim(p_payload ->> 'name'), '');
  clean_email text := nullif(lower(trim(p_payload ->> 'email')), '');
  clean_avatar text := nullif(trim(p_payload ->> 'avatarPath'), '');
  new_person uuid;
begin
  if not exists (select 1 from public.profiles where id = p_actor) then raise exception 'profile not found'; end if;
  if clean_name is null or char_length(clean_name) > 80 then raise exception 'invalid_person_name'; end if;
  if clean_email is not null and (char_length(clean_email) > 254 or clean_email !~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)+$') then
    raise exception 'invalid_person_email';
  end if;
  -- Uploads live at <owner id>/<file>; a photo must be one of the caller's own.
  if clean_avatar is not null and (strpos(clean_avatar, concat(p_actor::text, '/')) <> 1 or clean_avatar ~ '(^|/)\.\.?(/|$)') then
    raise exception 'invalid_avatar_path';
  end if;
  if exists (select 1 from public.people where owner_id = p_actor and lower(name) = lower(clean_name)) then
    raise exception 'person_exists';
  end if;
  begin
    insert into public.people (owner_id, name, email, avatar_path)
    values (p_actor, clean_name, clean_email, clean_avatar)
    returning id into new_person;
  exception when unique_violation then
    raise exception 'person_exists';
  end;
  perform private.link_person_transactions(p_actor, new_person);
  return new_person;
end;
$$;

-- Presence flags (updateName, updateEmail, updateAvatar) keep "leave as is" apart from "clear": with its flag set,
-- a null email or avatarPath clears it.
create or replace function public.app_update_person(p_actor uuid, p_person uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  update_name boolean := coalesce((p_payload ->> 'updateName')::boolean, false);
  update_email boolean := coalesce((p_payload ->> 'updateEmail')::boolean, false);
  update_avatar boolean := coalesce((p_payload ->> 'updateAvatar')::boolean, false);
  clean_name text := nullif(trim(p_payload ->> 'name'), '');
  clean_email text := nullif(lower(trim(p_payload ->> 'email')), '');
  clean_avatar text := nullif(trim(p_payload ->> 'avatarPath'), '');
  target public.people;
begin
  select * into target from public.people where id = p_person and owner_id = p_actor for update;
  if not found then raise exception 'person_not_found'; end if;
  if update_name and (clean_name is null or char_length(clean_name) > 80) then raise exception 'invalid_person_name'; end if;
  if update_email and clean_email is not null and (char_length(clean_email) > 254 or clean_email !~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)+$') then
    raise exception 'invalid_person_email';
  end if;
  if update_avatar and clean_avatar is not null and (strpos(clean_avatar, concat(p_actor::text, '/')) <> 1 or clean_avatar ~ '(^|/)\.\.?(/|$)') then
    raise exception 'invalid_avatar_path';
  end if;
  if update_name and exists (select 1 from public.people where owner_id = p_actor and lower(name) = lower(clean_name) and id <> p_person) then
    raise exception 'person_exists';
  end if;
  begin
    update public.people
    set name = case when update_name then clean_name else name end,
        email = case when update_email then clean_email else email end,
        avatar_path = case when update_avatar then clean_avatar else avatar_path end,
        updated_at = now()
    where id = p_person;
  exception when unique_violation then
    raise exception 'person_exists';
  end;
  -- History shows the person's current name.
  if update_name and clean_name is distinct from target.name then
    update public.personal_transactions set counterparty = clean_name where person_id = p_person and user_id = p_actor;
  end if;
end;
$$;

create or replace function public.app_delete_person(p_actor uuid, p_person uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Entries stay in the ledger with their counterparty text; the foreign key sets their person_id to null.
  delete from public.people where id = p_person and owner_id = p_actor;
  if not found then raise exception 'person_not_found'; end if;
end;
$$;

-- Same as 202609180006, plus: a given personId must be the caller's and supplies the counterparty (the server is
-- authoritative); without one, the counterparty's person is found (ignoring case) or created, and the entry links
-- to them under the person's name.
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
  requested_person uuid := nullif(p_payload ->> 'personId', '')::uuid;
  linked_person uuid;
  counterparty_name text := nullif(trim(p_payload ->> 'counterparty'), '');
begin
  existing_id := private.assert_idempotency(p_actor, p_idempotency_key, 'create_personal_transaction', payload_hash);
  if existing_id is not null then return existing_id; end if;
  if not exists (select 1 from public.profiles where id = p_actor) then raise exception 'profile not found'; end if;
  if transaction_kind not in ('expense', 'loan') then raise exception 'invalid transaction kind'; end if;
  if transaction_direction not in ('incoming', 'outgoing') then raise exception 'invalid transaction direction'; end if;
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
  insert into public.personal_transactions (user_id, title, event_date, amount_minor, currency, kind, direction, counterparty, note, receipt_path, person_id)
  values (
    p_actor,
    trim(p_payload ->> 'title'),
    (p_payload ->> 'eventDate')::date,
    (p_payload ->> 'amountMinor')::bigint,
    upper(p_payload ->> 'currency'),
    transaction_kind,
    transaction_direction,
    counterparty_name,
    nullif(trim(p_payload ->> 'note'), ''),
    nullif(p_payload ->> 'receiptUri', ''),
    linked_person
  )
  returning id into new_transaction;
  insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
  values (p_actor, p_idempotency_key, 'create_personal_transaction', payload_hash, new_transaction);
  return new_transaction;
end;
$$;

-- Same as 202609180006, plus personId on personal rows (null for group rows, dropped by jsonb_strip_nulls).
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
      pt.counterparty, pt.person_id, pt.note, pt.receipt_path, pt.status, pt.settled_at, pt.created_at
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
      case when e.paid_by = p_actor then null else payer.display_name end, null::uuid, e.note, e.receipt_path, null::text, null::timestamptz, e.created_at
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
    'kind', kind, 'counterparty', counterparty, 'personId', person_id, 'note', note, 'receiptUri', receipt_path,
    'status', status, 'settledAt', settled_at, 'createdAt', created_at
  )) order by created_at desc), '[]'::jsonb)
  from transaction_rows;
$$;

-- Internal helpers: only the SECURITY DEFINER app_* functions (running as their owner) call them.
revoke all on function private.link_person_transactions(uuid, uuid) from public, anon, authenticated;
revoke all on function private.find_or_create_person(uuid, text) from public, anon, authenticated;
revoke all on function public.app_get_people(uuid) from public, anon, authenticated;
revoke all on function public.app_create_person(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.app_update_person(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.app_delete_person(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_create_personal_transaction(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.app_get_transactions(uuid) from public, anon, authenticated;
grant execute on function public.app_get_people(uuid) to service_role;
grant execute on function public.app_create_person(uuid, jsonb) to service_role;
grant execute on function public.app_update_person(uuid, uuid, jsonb) to service_role;
grant execute on function public.app_delete_person(uuid, uuid) to service_role;
grant execute on function public.app_create_personal_transaction(uuid, jsonb, text) to service_role;
grant execute on function public.app_get_transactions(uuid) to service_role;

-- Person invites: an email to a saved person asking them to install LenaDena. The worker sends it like every other
-- outbox row (email-only recipient, so no profile, tone or group). Nothing about balances goes in the payload.
-- One invite per person per 12 hours, and per inviter and address (a deleted and re-added person, or two people
-- sharing an address, can't be used to repeat it). Locking the person row serializes concurrent requests for them.
create index if not exists notification_outbox_person_invite_idx
on public.notification_outbox ((payload ->> 'personId'), created_at desc)
where event_type = 'person_invite';

create index if not exists notification_outbox_person_invite_email_idx
on public.notification_outbox (recipient_email, created_at desc)
where event_type = 'person_invite';

create or replace function public.app_invite_person(p_actor uuid, p_person uuid, p_download_url text)
returns timestamptz
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target public.people;
  inviter_name text;
  clean_url text := nullif(trim(p_download_url), '');
  queued_at timestamptz := now();
begin
  select display_name into inviter_name from public.profiles where id = p_actor;
  if not found then raise exception 'profile not found'; end if;
  select * into target from public.people where id = p_person and owner_id = p_actor for update;
  if not found then raise exception 'person_not_found'; end if;
  if nullif(trim(target.email), '') is null then raise exception 'person_has_no_email'; end if;
  -- The API only passes an allowlisted https link (or its own configured one); this is a last line of defence.
  if clean_url is not null and (char_length(clean_url) > 2000 or clean_url !~ '^https://[^[:space:]"''<>]+$') then
    raise exception 'invalid_download_url';
  end if;
  if exists (
    select 1 from public.notification_outbox o
    where o.event_type = 'person_invite'
      and o.created_at > now() - interval '12 hours'
      and (
        o.payload ->> 'personId' = p_person::text
        or (o.recipient_email = target.email and o.payload ->> 'inviterId' = p_actor::text)
      )
  ) then
    raise exception 'invite_recently_sent';
  end if;
  insert into public.notification_outbox (recipient_email, event_type, payload, created_at, available_at)
  values (
    target.email,
    'person_invite',
    jsonb_build_object(
      'personId', target.id,
      'personName', target.name,
      'inviterId', p_actor,
      'inviterName', coalesce(nullif(trim(inviter_name), ''), 'A friend'),
      'downloadUrl', clean_url
    ),
    queued_at,
    queued_at
  );
  return queued_at;
end;
$$;

revoke all on function public.app_invite_person(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_invite_person(uuid, uuid, text) to service_role;

-- The notification worker marks rows sent or failed. The service role has no table privileges on the hosted
-- project, so a direct UPDATE fails there and every email would be claimed and sent again every few minutes.
-- Only the worker holding the lock can finish a row. Returns whether a row was updated.
create or replace function public.app_finish_notification(p_id uuid, p_worker uuid, p_error text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated integer;
begin
  if p_error is null then
    update public.notification_outbox
    set sent_at = now(), locked_at = null, locked_by = null, last_error = null
    where id = p_id and locked_by = p_worker;
  else
    update public.notification_outbox
    set locked_at = null, locked_by = null, last_error = left(p_error, 1000), available_at = now() + interval '5 minutes'
    where id = p_id and locked_by = p_worker;
  end if;
  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

revoke all on function public.app_finish_notification(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_finish_notification(uuid, uuid, text) to service_role;

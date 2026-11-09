-- Emails to saved people. The owner decides per person:
--   * email_updates     - email them when an entry is added (default on; needs an email address)
--   * reminder_frequency - 'off' | 'weekly' | 'monthly' reminders of what is still open
-- and can send the complete statement (with a PDF) any time. Everything is queued in notification_outbox like the
-- invite email (an email-only recipient: no profile, tone or group) and sent by the worker, which also builds the PDF.
--
-- Needs 202609180007 (people) and 202611030009 (settled_amount_minor). Every statement is guarded or idempotent.

alter table public.people
  add column if not exists email_updates boolean not null default true,
  add column if not exists reminder_frequency text not null default 'off',
  add column if not exists reminder_sent_at timestamptz;

alter table public.people drop constraint if exists people_reminder_frequency_check;
alter table public.people
  add constraint people_reminder_frequency_check check (reminder_frequency in ('off', 'weekly', 'monthly'));

create index if not exists people_reminder_due_idx
on public.people (reminder_sent_at)
where reminder_frequency <> 'off';

create index if not exists notification_outbox_person_email_idx
on public.notification_outbox ((payload ->> 'personId'), event_type, created_at desc)
where event_type in ('person_statement', 'person_entry', 'person_reminder');

create index if not exists notification_outbox_owner_email_idx
on public.notification_outbox ((payload ->> 'ownerId'), created_at desc)
where event_type in ('person_statement', 'person_entry', 'person_reminder');

-- The people list carries the two settings.
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
    'emailUpdates', p.email_updates,
    'reminderFrequency', p.reminder_frequency,
    'createdAt', p.created_at
  )) order by lower(p.name), p.id), '[]'::jsonb)
  from public.people p
  where p.owner_id = p_actor;
$$;

-- Same as 202609180007, plus emailUpdates and reminderFrequency (each behind its own presence flag). Choosing a
-- reminder schedule starts its clock now, so the first reminder arrives one period later, not immediately.
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
  update_email_updates boolean := coalesce((p_payload ->> 'updateEmailUpdates')::boolean, false);
  update_reminders boolean := coalesce((p_payload ->> 'updateReminderFrequency')::boolean, false);
  clean_name text := nullif(trim(p_payload ->> 'name'), '');
  clean_email text := nullif(lower(trim(p_payload ->> 'email')), '');
  clean_avatar text := nullif(trim(p_payload ->> 'avatarPath'), '');
  clean_frequency text := nullif(trim(p_payload ->> 'reminderFrequency'), '');
  new_email_updates boolean := (p_payload ->> 'emailUpdates')::boolean;
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
  if update_email_updates and new_email_updates is null then raise exception 'invalid_email_updates'; end if;
  if update_reminders and (clean_frequency is null or clean_frequency not in ('off', 'weekly', 'monthly')) then
    raise exception 'invalid_reminder_frequency';
  end if;
  if update_name and exists (select 1 from public.people where owner_id = p_actor and lower(name) = lower(clean_name) and id <> p_person) then
    raise exception 'person_exists';
  end if;
  begin
    update public.people
    set name = case when update_name then clean_name else name end,
        email = case when update_email then clean_email else email end,
        avatar_path = case when update_avatar then clean_avatar else avatar_path end,
        email_updates = case when update_email_updates then new_email_updates else email_updates end,
        reminder_frequency = case when update_reminders then clean_frequency else reminder_frequency end,
        reminder_sent_at = case
          when update_reminders and clean_frequency <> 'off' and clean_frequency is distinct from target.reminder_frequency then now()
          else reminder_sent_at
        end,
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

-- One entry as the email and the PDF show it. Directions are the owner's: outgoing = the owner owes the person.
create or replace function private.entry_json(pt public.personal_transactions)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id', pt.id,
    'title', pt.title,
    'eventDate', pt.event_date,
    'amountMinor', pt.amount_minor,
    'paidMinor', pt.settled_amount_minor,
    'currency', pt.currency::text,
    'direction', pt.direction,
    'kind', pt.kind,
    'status', pt.status,
    'note', pt.note
  ));
$$;

-- Everything between the owner and one person, newest first (capped), with what is still unpaid per currency. The
-- totals always count every entry; `p_only_open` and `p_limit` only shorten the list.
create or replace function private.person_snapshot(p_actor uuid, p_person uuid, p_only_open boolean default false, p_limit integer default 300)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select pt.id, pt.event_date, pt.created_at, pt.status, pt.currency, pt.direction, pt.amount_minor, pt.settled_amount_minor
    from public.personal_transactions pt
    where pt.user_id = p_actor and pt.person_id = p_person
  ), listed as (
    select m.id from mine m
    where (not p_only_open or m.status = 'open')
    order by m.event_date desc, m.created_at desc, m.id desc
    limit greatest(1, least(p_limit, 300))
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'entryCount', (select count(*) from mine),
    'openCount', (select count(*) from mine where status = 'open'),
    -- entry_json takes the real table row, so the listed ids are joined back to personal_transactions.
    'entries', coalesce((
      select jsonb_agg(private.entry_json(pt) order by pt.event_date desc, pt.created_at desc, pt.id desc)
      from public.personal_transactions pt
      where pt.user_id = p_actor and pt.id in (select l.id from listed l)
    ), '[]'::jsonb),
    'totals', coalesce((
      select jsonb_agg(jsonb_build_object('currency', t.currency, 'personOwesMinor', t.person_owes, 'ownerOwesMinor', t.owner_owes) order by t.currency)
      from (
        select m.currency::text as currency,
               sum(case when m.direction = 'incoming' then m.amount_minor - m.settled_amount_minor else 0 end) as person_owes,
               sum(case when m.direction = 'outgoing' then m.amount_minor - m.settled_amount_minor else 0 end) as owner_owes
        from mine m
        where m.status = 'open'
        group by m.currency
        having sum(m.amount_minor - m.settled_amount_minor) > 0
      ) t
    ), '[]'::jsonb)
  );
$$;

-- Queues one email to a saved person. `p_kind`: 'statement' (everything, with a PDF), 'entry' (a new entry plus where
-- things stand) or 'reminder' (what is still open). A delay plus `p_coalesce` folds entries added a moment apart into
-- one pending email instead of sending several. Callers lock the person row first.
create or replace function private.queue_person_email(p_actor uuid, p_person uuid, p_kind text, p_transaction uuid, p_delay interval, p_coalesce boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.people;
  owner_name text;
  owner_email text;
  tx public.personal_transactions;
  base jsonb;
  snapshot jsonb;
  new_entry jsonb;
  pending public.notification_outbox;
  queued_at timestamptz := now();
  event text := 'person_' || p_kind;
begin
  select display_name, email into owner_name, owner_email from public.profiles where id = p_actor;
  if not found then raise exception 'profile not found'; end if;
  select * into target from public.people where id = p_person and owner_id = p_actor;
  if not found then raise exception 'person_not_found'; end if;
  if nullif(trim(target.email), '') is null then raise exception 'person_has_no_email'; end if;
  -- A hard daily ceiling so the app can't be used to mail a stranger repeatedly.
  if (
    select count(*) from public.notification_outbox o
    where o.event_type in ('person_statement', 'person_entry', 'person_reminder')
      and o.payload ->> 'ownerId' = p_actor::text
      and o.created_at > now() - interval '24 hours'
  ) >= 100 then
    raise exception 'email_limit_reached';
  end if;

  base := jsonb_build_object(
    'personId', target.id,
    'personName', target.name,
    'ownerId', p_actor,
    'ownerName', coalesce(nullif(trim(owner_name), ''), 'A friend'),
    'ownerEmail', owner_email
  );

  if p_kind = 'entry' then
    select * into tx from public.personal_transactions where id = p_transaction and user_id = p_actor and person_id = p_person;
    if not found then raise exception 'transaction_not_found'; end if;
    new_entry := private.entry_json(tx);
    snapshot := private.person_snapshot(p_actor, p_person, true, 10);
    if p_coalesce then
      select * into pending from public.notification_outbox o
      where o.event_type = 'person_entry' and o.sent_at is null and o.locked_at is null and o.available_at > now()
        and o.payload ->> 'personId' = p_person::text
      order by o.created_at desc
      limit 1
      for update skip locked;
      if found then
        update public.notification_outbox
        set payload = pending.payload || snapshot || jsonb_build_object('newEntries', coalesce(pending.payload -> 'newEntries', '[]'::jsonb) || jsonb_build_array(new_entry))
        where id = pending.id;
        return pending.created_at;
      end if;
    end if;
    snapshot := snapshot || jsonb_build_object('newEntries', jsonb_build_array(new_entry));
  elsif p_kind = 'statement' then
    snapshot := private.person_snapshot(p_actor, p_person, false, 300);
  elsif p_kind = 'reminder' then
    snapshot := private.person_snapshot(p_actor, p_person, true, 15) || jsonb_build_object('frequency', target.reminder_frequency);
  else
    raise exception 'invalid_email_kind';
  end if;

  if p_kind in ('statement', 'reminder') and (snapshot ->> 'entryCount')::integer = 0 then raise exception 'no_entries'; end if;

  insert into public.notification_outbox (recipient_email, event_type, payload, created_at, available_at)
  values (target.email, event, base || snapshot, queued_at, queued_at + p_delay);
  return queued_at;
end;
$$;

-- "Email them now" from the app: the full statement (cooldown 5 minutes per person) or one entry (right away).
create or replace function public.app_queue_person_email(p_actor uuid, p_person uuid, p_kind text, p_transaction uuid default null)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('statement', 'entry') then raise exception 'invalid_email_kind'; end if;
  -- Locking the person serializes concurrent requests, so the cooldown below can't be raced.
  perform 1 from public.people where id = p_person and owner_id = p_actor for update;
  if not found then raise exception 'person_not_found'; end if;
  if p_kind = 'statement' and exists (
    select 1 from public.notification_outbox o
    where o.event_type = 'person_statement' and o.payload ->> 'personId' = p_person::text and o.created_at > now() - interval '5 minutes'
  ) then
    raise exception 'email_recently_sent';
  end if;
  return private.queue_person_email(p_actor, p_person, p_kind, p_transaction, interval '0 seconds', false);
end;
$$;

-- Called right after an entry is created. Decides what to do about email:
--   sent - the person already has something open with you, so LenaDena queued an email about the new entry (after a
--          short wait, so entries added together go out as one email)
--   ask  - they had nothing open before (a new contact, or an old one all settled): the app asks whether to email
--   none - no email address, or the owner turned updates off for this person
create or replace function public.app_notify_new_entry(p_actor uuid, p_transaction uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tx public.personal_transactions;
  target public.people;
  had_open boolean;
begin
  select * into tx from public.personal_transactions where id = p_transaction and user_id = p_actor;
  if not found then raise exception 'transaction_not_found'; end if;
  if tx.person_id is null then return jsonb_build_object('action', 'none', 'reason', 'no_person'); end if;
  select * into target from public.people where id = tx.person_id and owner_id = p_actor for update;
  if not found then return jsonb_build_object('action', 'none', 'reason', 'no_person'); end if;
  if nullif(trim(target.email), '') is null then return jsonb_build_object('action', 'none', 'reason', 'no_email'); end if;
  if not target.email_updates then return jsonb_build_object('action', 'none', 'reason', 'disabled'); end if;
  select exists (
    select 1 from public.personal_transactions o
    where o.user_id = p_actor and o.person_id = target.id and o.id <> tx.id
      and o.status = 'open' and o.amount_minor > o.settled_amount_minor
  ) into had_open;
  if not had_open then
    return jsonb_build_object('action', 'ask', 'personId', target.id, 'personName', target.name, 'email', target.email);
  end if;
  begin
    perform private.queue_person_email(p_actor, target.id, 'entry', p_transaction, interval '90 seconds', true);
  exception when others then
    if sqlerrm = 'email_limit_reached' then return jsonb_build_object('action', 'none', 'reason', 'limited'); end if;
    raise;
  end;
  return jsonb_build_object('action', 'sent', 'personId', target.id, 'personName', target.name, 'email', target.email);
end;
$$;

-- The worker calls this every cycle. For every person with a reminder schedule whose period has passed, it queues a
-- reminder of what is still open (nobody with nothing open is mailed) and restarts the clock. A failure for one
-- person only postpones them by a day.
create or replace function public.app_enqueue_person_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  due record;
  period interval;
  queued integer := 0;
begin
  for due in
    select p.id, p.owner_id, p.reminder_frequency
    from public.people p
    where p.reminder_frequency <> 'off'
      and nullif(trim(p.email), '') is not null
      and coalesce(p.reminder_sent_at, p.updated_at) <= now() - (case p.reminder_frequency when 'weekly' then interval '7 days' else interval '1 month' end)
    order by coalesce(p.reminder_sent_at, p.updated_at)
    limit 200
    for update of p skip locked
  loop
    period := case due.reminder_frequency when 'weekly' then interval '7 days' else interval '1 month' end;
    begin
      if exists (
        select 1 from public.personal_transactions o
        where o.user_id = due.owner_id and o.person_id = due.id and o.status = 'open' and o.amount_minor > o.settled_amount_minor
      ) then
        perform private.queue_person_email(due.owner_id, due.id, 'reminder', null, interval '0 seconds', false);
        queued := queued + 1;
      end if;
      update public.people set reminder_sent_at = now() where id = due.id;
    exception when others then
      update public.people set reminder_sent_at = now() - period + interval '1 day' where id = due.id;
    end;
  end loop;
  return queued;
end;
$$;

revoke all on function private.entry_json(public.personal_transactions) from public, anon, authenticated;
revoke all on function private.person_snapshot(uuid, uuid, boolean, integer) from public, anon, authenticated;
revoke all on function private.queue_person_email(uuid, uuid, text, uuid, interval, boolean) from public, anon, authenticated;
revoke all on function public.app_get_people(uuid) from public, anon, authenticated;
revoke all on function public.app_update_person(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.app_queue_person_email(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.app_notify_new_entry(uuid, uuid) from public, anon, authenticated;
revoke all on function public.app_enqueue_person_reminders() from public, anon, authenticated;
grant execute on function public.app_get_people(uuid) to service_role;
grant execute on function public.app_update_person(uuid, uuid, jsonb) to service_role;
grant execute on function public.app_queue_person_email(uuid, uuid, text, uuid) to service_role;
grant execute on function public.app_notify_new_entry(uuid, uuid) to service_role;
grant execute on function public.app_enqueue_person_reminders() to service_role;

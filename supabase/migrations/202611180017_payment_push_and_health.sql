-- Payment notifications and the database health check.
--
--   * app_get_payment_push_target: after a payment step (the payer says they paid, the recipient confirms or flags it,
--     the payer settles it after the review window), the API asks who to notify and what to say. It answers only for a
--     step that was the caller's and just happened, only when the other person has a registered phone, only once per
--     step (push_events), and not when one payer claims payments to the same person in a flood. It changes nothing a
--     payment depends on: the settlement functions are untouched, and a failure here never undoes a payment.
--   * push_events: one row per (payment, event) that already produced a notification, so a retried request cannot
--     notify twice. No personal data: an id, an event name and a time. Rows older than a week are deleted on use.
--   * app_health_check: lets GET /health/ready ask the database a trivial question and learn which features' functions
--     it lacks (a migration not applied yet). Returns names of features, never data.
-- Safe to run more than once.

create table if not exists public.push_events (
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  event text not null check (event in ('claimed', 'confirmed', 'needs_attention', 'self_confirmed')),
  created_at timestamptz not null default now(),
  primary key (settlement_id, event)
);
create index if not exists push_events_created_idx on public.push_events (created_at);
alter table public.push_events enable row level security;
revoke all on public.push_events from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Who to notify about a payment step the caller just took. Returns null for "nobody": the step is not the caller's or
-- is not fresh, there is no registered phone, it was already notified, or it is too many claims in an hour.
--
-- Events and what proves them (the status is read again here, so a caller cannot ask for a notification about a step
-- that did not happen):
--   claimed          caller is the payer, still awaiting review, created within 10 minutes   -> the recipient
--   confirmed        caller is the recipient, confirmed by recipient review, within 10 min   -> the payer
--   needs_attention  caller is the recipient, flagged, within 10 minutes                     -> the payer
--   self_confirmed   caller is the payer, settled by the payer's fallback, within 10 min     -> the recipient
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_get_payment_push_target(p_actor uuid, p_settlement uuid, p_event text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.settlements;
  target uuid;
  device_tokens jsonb;
  fresh timestamptz := now() - interval '10 minutes';
  inserted integer;
begin
  if p_event is null or p_event not in ('claimed', 'confirmed', 'needs_attention', 'self_confirmed') then return null; end if;
  select * into s from public.settlements where id = p_settlement;
  if not found then return null; end if;

  if p_event = 'claimed' then
    if s.debtor_id <> p_actor or s.status <> 'awaiting_review' or s.created_at < fresh then return null; end if;
    target := s.recipient_id;
    -- Someone claiming payment after payment to the same person is not a payment, it is a way to buzz their phone.
    if (select count(*) from public.settlements x
        where x.debtor_id = s.debtor_id and x.recipient_id = s.recipient_id and x.created_at > now() - interval '1 hour') > 5 then
      return null;
    end if;
  elsif p_event in ('confirmed', 'needs_attention') then
    if s.recipient_id <> p_actor or s.status::text <> p_event or s.reviewed_at is null or s.reviewed_at < fresh then return null; end if;
    if p_event = 'confirmed' and s.confirmation_method is distinct from 'recipient_review' then return null; end if;
    target := s.debtor_id;
  else
    if s.debtor_id <> p_actor or s.status <> 'confirmed' or s.confirmation_method is distinct from 'claimant_fallback' or s.reviewed_at is null or s.reviewed_at < fresh then return null; end if;
    target := s.recipient_id;
  end if;

  if not exists (select 1 from public.profiles p where p.id = target and p.deleted_at is null) then return null; end if;
  select coalesce(jsonb_agg(t.token order by t.last_seen_at desc), '[]'::jsonb) into device_tokens from public.push_tokens t where t.user_id = target;
  if jsonb_array_length(device_tokens) = 0 then return null; end if;

  -- Once per step: only the call that records the row gets the devices.
  insert into public.push_events (settlement_id, event) values (p_settlement, p_event) on conflict do nothing;
  get diagnostics inserted = row_count;
  if inserted = 0 then return null; end if;
  delete from public.push_events where created_at < now() - interval '7 days';

  return jsonb_build_object(
    'tokens', device_tokens,
    'event', p_event,
    'actorName', (select display_name from public.profiles where id = p_actor),
    'amountMinor', s.amount_minor,
    'currency', s.currency::text,
    'groupId', s.group_id,
    'groupName', (select name from public.groups where id = s.group_id),
    'settlementId', s.id
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Health check. `missing` lists the features whose functions are not in the database: each name stands for one
-- migration, using a function that migration created. An empty list means everything the API calls is there.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.app_health_check()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'missing', coalesce(
      jsonb_agg(f.feature order by f.feature) filter (where not exists (
        select 1 from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = f.fn
      )),
      '[]'::jsonb
    )
  )
  from (values
    ('people', 'app_create_person'),
    ('person_emails', 'app_queue_person_email'),
    ('edit_and_delete', 'app_delete_expense'),
    ('export', 'app_export_data'),
    ('group_management', 'app_get_group_people'),
    ('push_notifications', 'app_create_nudge'),
    ('payment_push', 'app_get_payment_push_target')
  ) as f(feature, fn);
$$;

revoke all on function public.app_get_payment_push_target(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_health_check() from public, anon, authenticated;
grant execute on function public.app_get_payment_push_target(uuid, uuid, text) to service_role;
grant execute on function public.app_health_check() to service_role;

notify pgrst, 'reload schema';

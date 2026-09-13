create extension if not exists pgcrypto;

create type public.group_role as enum ('owner', 'admin', 'member');
create type public.split_method as enum ('equal', 'exact', 'percentage');
create type public.settlement_status as enum ('awaiting_review', 'confirmed', 'needs_attention', 'reversed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null check (char_length(display_name) between 1 and 80),
  theme text not null default 'dusk' check (theme in ('dusk', 'cloud', 'midnight', 'system')),
  email_tone text not null default 'friendly' check (email_tone in ('friendly', 'cheeky', 'chaos', 'quiet')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  currency char(3) not null,
  accent char(7) not null check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  owner_id uuid not null references public.profiles(id),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  role public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (group_id, member_id)
);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  invited_by uuid not null references public.profiles(id),
  email text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  event_name text not null check (char_length(event_name) between 1 and 80),
  event_date date not null,
  note text check (char_length(note) <= 500),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  paid_by uuid not null references public.profiles(id),
  split_method public.split_method not null,
  receipt_path text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  reversed_at timestamptz
);

create table public.expense_shares (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid not null references public.profiles(id),
  amount_minor bigint not null check (amount_minor >= 0),
  percentage_basis_points integer check (percentage_basis_points between 0 and 10000),
  primary key (expense_id, member_id)
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  debtor_id uuid not null references public.profiles(id),
  recipient_id uuid not null references public.profiles(id),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  status public.settlement_status not null default 'awaiting_review',
  proof_path text,
  debtor_note text check (char_length(debtor_note) <= 500),
  review_note text check (char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (debtor_id <> recipient_id)
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  kind text not null,
  title text not null check (char_length(title) <= 160),
  detail text not null check (char_length(detail) <= 300),
  tone text not null check (tone in ('neutral', 'positive', 'warning')),
  created_at timestamptz not null default now()
);

create table public.idempotency_keys (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  key text not null check (char_length(key) between 8 and 200),
  operation text not null,
  request_hash text not null,
  result_id uuid,
  created_at timestamptz not null default now(),
  primary key (actor_id, key)
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.profiles(id),
  recipient_email text,
  group_id uuid references public.groups(id),
  event_type text not null,
  payload jsonb not null,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  locked_at timestamptz,
  locked_by uuid,
  created_at timestamptz not null default now(),
  check (num_nonnulls(recipient_id, recipient_email) = 1)
);

create index group_members_member_active_idx on public.group_members(member_id, group_id) where left_at is null;
create index expenses_group_date_idx on public.expenses(group_id, event_date desc) where reversed_at is null;
create index expense_shares_member_idx on public.expense_shares(member_id, expense_id);
create index settlements_review_idx on public.settlements(recipient_id, status, created_at desc);
create index settlements_group_pair_idx on public.settlements(group_id, debtor_id, recipient_id);
create index activity_group_created_idx on public.activity_events(group_id, created_at desc);
create index notification_outbox_pending_idx on public.notification_outbox(available_at) where sent_at is null;

create schema if not exists private;

create function private.is_group_member(p_group uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group and member_id = p_user and left_at is null
  );
$$;

create function private.is_group_admin(p_group uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group and member_id = p_user and role in ('owner', 'admin') and left_at is null
  );
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, 'Friend'), '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;
alter table public.settlements enable row level security;
alter table public.activity_events enable row level security;
alter table public.idempotency_keys enable row level security;
alter table public.notification_outbox enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy groups_member_select on public.groups for select to authenticated using (private.is_group_member(id, auth.uid()));
create policy group_members_member_select on public.group_members for select to authenticated using (private.is_group_member(group_id, auth.uid()));
create policy group_invites_admin_select on public.group_invites for select to authenticated using (private.is_group_admin(group_id, auth.uid()) or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
create policy expenses_member_select on public.expenses for select to authenticated using (private.is_group_member(group_id, auth.uid()));
create policy expense_shares_member_select on public.expense_shares for select to authenticated using (exists (select 1 from public.expenses e where e.id = expense_id and private.is_group_member(e.group_id, auth.uid())));
create policy settlements_party_select on public.settlements for select to authenticated using (debtor_id = auth.uid() or recipient_id = auth.uid());
create policy activity_member_select on public.activity_events for select to authenticated using (private.is_group_member(group_id, auth.uid()));

revoke all on public.idempotency_keys from anon, authenticated;
revoke all on public.notification_outbox from anon, authenticated;
revoke insert, update, delete on public.groups, public.group_members, public.group_invites, public.expenses, public.expense_shares, public.settlements, public.activity_events from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
       ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create function private.assert_idempotency(p_actor uuid, p_key text, p_operation text, p_hash text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.idempotency_keys;
begin
  select * into existing from public.idempotency_keys where actor_id = p_actor and key = p_key;
  if found then
    if existing.operation <> p_operation or existing.request_hash <> p_hash then
      raise exception 'idempotency key was already used for another request';
    end if;
    return existing.result_id;
  end if;
  return null;
end;
$$;

create function public.app_create_group(
  p_actor uuid,
  p_name text,
  p_currency text,
  p_accent text,
  p_invite_emails text[],
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  payload_hash text := encode(digest(concat_ws('|', p_name, p_currency, p_accent, array_to_string(p_invite_emails, ',')), 'sha256'), 'hex');
  existing_id uuid;
  new_group uuid;
  invite_email text;
  invite_token text;
begin
  existing_id := private.assert_idempotency(p_actor, p_idempotency_key, 'create_group', payload_hash);
  if existing_id is not null then return existing_id; end if;
  if not exists (select 1 from public.profiles where id = p_actor) then raise exception 'profile not found'; end if;
  insert into public.groups (name, currency, accent, owner_id) values (p_name, upper(p_currency), p_accent, p_actor) returning id into new_group;
  insert into public.group_members (group_id, member_id, role) values (new_group, p_actor, 'owner');
  foreach invite_email in array coalesce(p_invite_emails, array[]::text[]) loop
    if lower(invite_email) <> lower((select email from public.profiles where id = p_actor)) then
      invite_token := encode(gen_random_bytes(24), 'hex');
      insert into public.group_invites (group_id, invited_by, email, token_hash, expires_at)
      values (new_group, p_actor, lower(invite_email), encode(digest(invite_token, 'sha256'), 'hex'), now() + interval '7 days');
      insert into public.notification_outbox (recipient_email, group_id, event_type, payload)
      values (lower(invite_email), new_group, 'group_invite', jsonb_build_object('url', concat('lenadena://invite/', invite_token)));
    end if;
  end loop;
  insert into public.activity_events (group_id, actor_id, kind, title, detail, tone)
  values (new_group, p_actor, 'group_created', 'Group created', p_name, 'positive');
  insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
  values (p_actor, p_idempotency_key, 'create_group', payload_hash, new_group);
  return new_group;
end;
$$;

create function public.app_create_invite(p_actor uuid, p_group uuid, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_token text := encode(gen_random_bytes(24), 'hex');
  invite_expiry timestamptz := now() + interval '7 days';
begin
  if not private.is_group_member(p_group, p_actor) then raise exception 'group membership required'; end if;
  insert into public.group_invites (group_id, invited_by, email, token_hash, expires_at)
  values (p_group, p_actor, nullif(lower(trim(p_email)), ''), encode(digest(invite_token, 'sha256'), 'hex'), invite_expiry);
  if nullif(trim(p_email), '') is not null then
    insert into public.notification_outbox (recipient_email, group_id, event_type, payload)
    values (lower(trim(p_email)), p_group, 'group_invite', jsonb_build_object('url', concat('lenadena://invite/', invite_token)));
  end if;
  return jsonb_build_object('url', concat('lenadena://invite/', invite_token), 'expiresAt', invite_expiry);
end;
$$;

create function public.app_accept_invite(p_actor uuid, p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.group_invites;
  actor_email text;
begin
  select * into target from public.group_invites
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
  for update;
  if not found or target.revoked_at is not null or target.expires_at <= now() then raise exception 'invite is invalid or expired'; end if;
  if target.accepted_at is not null then
    if target.accepted_by = p_actor then return target.group_id; end if;
    raise exception 'invite has already been used';
  end if;
  select lower(email) into actor_email from public.profiles where id = p_actor;
  if actor_email is null then raise exception 'profile not found'; end if;
  if target.email is not null and lower(target.email) <> actor_email then raise exception 'invite belongs to another email address'; end if;
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

create function public.app_enqueue_due_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer;
begin
  with charges as (
    select e.group_id, es.member_id as debtor_id, e.paid_by as recipient_id, e.currency, sum(es.amount_minor)::bigint as amount_minor
    from public.expenses e
    join public.expense_shares es on es.expense_id = e.id
    where e.reversed_at is null and es.member_id <> e.paid_by
    group by e.group_id, es.member_id, e.paid_by, e.currency
  ), paid as (
    select group_id, debtor_id, recipient_id, sum(amount_minor)::bigint as amount_minor
    from public.settlements
    where status = 'confirmed'
    group by group_id, debtor_id, recipient_id
  ), awaiting as (
    select distinct group_id, debtor_id, recipient_id
    from public.settlements
    where status = 'awaiting_review'
  ), due as (
    select c.*, c.amount_minor - coalesce(p.amount_minor, 0) as open_minor
    from charges c
    left join paid p using (group_id, debtor_id, recipient_id)
    left join awaiting a using (group_id, debtor_id, recipient_id)
    where a.debtor_id is null and c.amount_minor - coalesce(p.amount_minor, 0) > 0
  )
  insert into public.notification_outbox (recipient_id, group_id, event_type, payload)
  select d.debtor_id, d.group_id, 'debt_reminder', jsonb_build_object('amountMinor', d.open_minor, 'currency', d.currency, 'recipientId', d.recipient_id)
  from due d
  where not exists (
    select 1 from public.notification_outbox o
    where o.recipient_id = d.debtor_id and o.group_id = d.group_id and o.event_type = 'debt_reminder' and o.created_at > now() - interval '72 hours'
  );
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create function public.app_claim_notifications(p_worker uuid, p_limit integer default 25)
returns table (
  id uuid,
  "eventType" text,
  "recipientEmail" text,
  "recipientName" text,
  "groupName" text,
  tone text,
  payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select o.id
    from public.notification_outbox o
    where o.sent_at is null
      and o.available_at <= now()
      and (o.locked_at is null or o.locked_at < now() - interval '5 minutes')
    order by o.available_at, o.created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  ), claimed as (
    update public.notification_outbox o
    set locked_at = now(), locked_by = p_worker, attempts = o.attempts + 1
    from candidates c
    where o.id = c.id
    returning o.*
  )
  select c.id,
    c.event_type,
    coalesce(c.recipient_email, p.email),
    coalesce(p.display_name, 'Friend'),
    coalesce(g.name, 'your group'),
    coalesce(p.email_tone, 'friendly'),
    c.payload
  from claimed c
  left join public.profiles p on p.id = c.recipient_id
  left join public.groups g on g.id = c.group_id
  where coalesce(c.recipient_email, p.email) is not null;
end;
$$;

create function public.app_create_expense(p_actor uuid, p_payload jsonb, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  payload_hash text := encode(digest(p_payload::text, 'sha256'), 'hex');
  existing_id uuid;
  new_expense uuid;
  group_currency char(3);
  total_shares bigint;
  total_basis integer;
begin
  existing_id := private.assert_idempotency(p_actor, p_idempotency_key, 'create_expense', payload_hash);
  if existing_id is not null then return existing_id; end if;
  if not private.is_group_member((p_payload ->> 'groupId')::uuid, p_actor) then raise exception 'group membership required'; end if;
  if not private.is_group_member((p_payload ->> 'groupId')::uuid, (p_payload ->> 'paidByMemberId')::uuid) then raise exception 'payer must be a group member'; end if;
  select coalesce(sum((share ->> 'amountMinor')::bigint), 0), coalesce(sum((share ->> 'percentageBasisPoints')::integer), 0)
  into total_shares, total_basis
  from jsonb_array_elements(p_payload -> 'shares') share;
  if total_shares <> (p_payload ->> 'amountMinor')::bigint then raise exception 'shares must equal amount'; end if;
  if p_payload ->> 'splitMethod' = 'percentage' and total_basis <> 10000 then raise exception 'percentages must equal 100 percent'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_payload -> 'shares') share
    where not private.is_group_member((p_payload ->> 'groupId')::uuid, (share ->> 'memberId')::uuid)
  ) then raise exception 'participant must be a group member'; end if;
  select currency into group_currency from public.groups where id = (p_payload ->> 'groupId')::uuid;
  insert into public.expenses (group_id, event_name, event_date, note, amount_minor, currency, paid_by, split_method, receipt_path, created_by)
  values ((p_payload ->> 'groupId')::uuid, p_payload ->> 'eventName', (p_payload ->> 'eventDate')::date, nullif(p_payload ->> 'note', ''), (p_payload ->> 'amountMinor')::bigint, group_currency, (p_payload ->> 'paidByMemberId')::uuid, (p_payload ->> 'splitMethod')::public.split_method, nullif(p_payload ->> 'receiptUri', ''), p_actor)
  returning id into new_expense;
  insert into public.expense_shares (expense_id, member_id, amount_minor, percentage_basis_points)
  select new_expense, (share ->> 'memberId')::uuid, (share ->> 'amountMinor')::bigint, nullif(share ->> 'percentageBasisPoints', '')::integer
  from jsonb_array_elements(p_payload -> 'shares') share;
  insert into public.activity_events (group_id, actor_id, kind, title, detail, tone)
  values ((p_payload ->> 'groupId')::uuid, p_actor, 'expense_created', p_payload ->> 'eventName', concat((p_payload ->> 'amountMinor')::numeric / 100, ' ', group_currency), 'neutral');
  insert into public.notification_outbox (recipient_id, group_id, event_type, payload)
  select (share ->> 'memberId')::uuid,
    (p_payload ->> 'groupId')::uuid,
    'expense_added',
    jsonb_build_object('expenseId', new_expense, 'eventName', p_payload ->> 'eventName', 'amountMinor', (share ->> 'amountMinor')::bigint, 'currency', group_currency)
  from jsonb_array_elements(p_payload -> 'shares') share
  where (share ->> 'memberId')::uuid <> p_actor;
  insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
  values (p_actor, p_idempotency_key, 'create_expense', payload_hash, new_expense);
  return new_expense;
end;
$$;

create function public.app_claim_settlement(p_actor uuid, p_payload jsonb, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  payload_hash text := encode(digest(p_payload::text, 'sha256'), 'hex');
  existing_id uuid;
  new_settlement uuid;
  open_amount bigint;
  group_currency char(3);
  recipient uuid := (p_payload ->> 'recipientMemberId')::uuid;
  target_group uuid := (p_payload ->> 'groupId')::uuid;
begin
  existing_id := private.assert_idempotency(p_actor, p_idempotency_key, 'claim_settlement', payload_hash);
  if existing_id is not null then return existing_id; end if;
  if not private.is_group_member(target_group, p_actor) or not private.is_group_member(target_group, recipient) then raise exception 'group membership required'; end if;
  select coalesce(sum(es.amount_minor), 0) - coalesce((
    select sum(s.amount_minor) from public.settlements s
    where s.group_id = target_group and s.debtor_id = p_actor and s.recipient_id = recipient and s.status in ('confirmed', 'awaiting_review')
  ), 0)
  into open_amount
  from public.expenses e
  join public.expense_shares es on es.expense_id = e.id and es.member_id = p_actor
  where e.group_id = target_group and e.paid_by = recipient and e.reversed_at is null;
  if (p_payload ->> 'amountMinor')::bigint <= 0 or (p_payload ->> 'amountMinor')::bigint > open_amount then raise exception 'payment exceeds open amount'; end if;
  select currency into group_currency from public.groups where id = target_group;
  insert into public.settlements (group_id, debtor_id, recipient_id, amount_minor, currency, proof_path, debtor_note)
  values (target_group, p_actor, recipient, (p_payload ->> 'amountMinor')::bigint, group_currency, nullif(p_payload ->> 'proofUri', ''), nullif(p_payload ->> 'note', ''))
  returning id into new_settlement;
  insert into public.activity_events (group_id, actor_id, kind, title, detail, tone)
  values (target_group, p_actor, 'payment_claimed', 'Payment submitted for review', concat((p_payload ->> 'amountMinor')::numeric / 100, ' ', group_currency), 'warning');
  insert into public.notification_outbox (recipient_id, group_id, event_type, payload)
  values (recipient, target_group, 'payment_claimed', jsonb_build_object('settlementId', new_settlement));
  insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
  values (p_actor, p_idempotency_key, 'claim_settlement', payload_hash, new_settlement);
  return new_settlement;
end;
$$;

create function public.app_review_settlement(p_actor uuid, p_settlement uuid, p_decision text, p_note text, p_idempotency_key text)
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
  update public.settlements set status = p_decision::public.settlement_status, review_note = nullif(p_note, ''), reviewed_at = now() where id = p_settlement;
  insert into public.activity_events (group_id, actor_id, kind, title, detail, tone)
  values (target.group_id, p_actor, concat('payment_', p_decision), case when p_decision = 'confirmed' then 'Payment confirmed' else 'Payment needs attention' end, concat(target.amount_minor::numeric / 100, ' ', target.currency), case when p_decision = 'confirmed' then 'positive' else 'warning' end);
  insert into public.notification_outbox (recipient_id, group_id, event_type, payload)
  values (target.debtor_id, target.group_id, concat('payment_', p_decision), jsonb_build_object('settlementId', p_settlement));
  insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
  values (p_actor, p_idempotency_key, 'review_settlement', payload_hash, p_settlement);
end;
$$;

create function public.app_get_plan(p_actor uuid)
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
    'user', jsonb_build_object('id', p.id, 'name', p.display_name, 'email', p.email),
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
      'members', coalesce((select jsonb_agg(jsonb_build_object('id', mp.id, 'name', mp.display_name, 'email', mp.email) order by mp.display_name)
        from public.group_members mm join public.profiles mp on mp.id = mm.member_id
        where mm.group_id = mg.id and mm.left_at is null), '[]'::jsonb)
    ) order by mg.created_at desc) from member_groups mg join balances b on b.id = mg.id), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'groupId', s.group_id,
      'debtor', jsonb_build_object('id', dp.id, 'name', dp.display_name, 'email', dp.email),
      'recipient', jsonb_build_object('id', rp.id, 'name', rp.display_name, 'email', rp.email),
      'amountMinor', s.amount_minor,
      'currency', s.currency,
      'status', s.status,
      'proofUri', s.proof_path,
      'note', s.debtor_note,
      'createdAt', s.created_at
    ) order by s.created_at desc)
    from public.settlements s join public.profiles dp on dp.id = s.debtor_id join public.profiles rp on rp.id = s.recipient_id
    where s.recipient_id = p_actor and s.status = 'awaiting_review'), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(item order by item ->> 'createdAt' desc) from (
      select jsonb_build_object(
        'id', a.id,
        'icon', case a.kind when 'expense_created' then 'file-text' when 'payment_claimed' then 'send' when 'payment_confirmed' then 'check-circle' when 'payment_needs_attention' then 'alert-circle' else 'users' end,
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

revoke all on function public.app_create_group(uuid, text, text, text, text[], text) from public, anon, authenticated;
revoke all on function public.app_create_invite(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.app_accept_invite(uuid, text) from public, anon, authenticated;
revoke all on function public.app_enqueue_due_reminders() from public, anon, authenticated;
revoke all on function public.app_claim_notifications(uuid, integer) from public, anon, authenticated;
revoke all on function public.app_create_expense(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.app_claim_settlement(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.app_review_settlement(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.app_get_plan(uuid) from public, anon, authenticated;
grant execute on function public.app_create_group(uuid, text, text, text, text[], text) to service_role;
grant execute on function public.app_create_invite(uuid, uuid, text) to service_role;
grant execute on function public.app_accept_invite(uuid, text) to service_role;
grant execute on function public.app_enqueue_due_reminders() to service_role;
grant execute on function public.app_claim_notifications(uuid, integer) to service_role;
grant execute on function public.app_create_expense(uuid, jsonb, text) to service_role;
grant execute on function public.app_claim_settlement(uuid, jsonb, text) to service_role;
grant execute on function public.app_review_settlement(uuid, uuid, text, text, text) to service_role;
grant execute on function public.app_get_plan(uuid) to service_role;

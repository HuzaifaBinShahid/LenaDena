create or replace function public.app_create_group(
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

create or replace function public.app_create_invite(p_actor uuid, p_group uuid, p_email text)
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

update public.notification_outbox
set payload = jsonb_set(payload, '{url}', to_jsonb(replace(payload ->> 'url', concat('owe', 'yaar://'), 'lenadena://')))
where payload ->> 'url' like concat('owe', 'yaar://%');

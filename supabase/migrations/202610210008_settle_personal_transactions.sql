-- Settle a selected person's open individual entries in one atomic write. The client sends the ids visible on
-- that person's history screen; ownership is checked for every id before any row changes.
create function public.app_settle_personal_transactions(p_actor uuid, p_transactions uuid[], p_idempotency_key text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  payload_hash text := encode(digest(to_jsonb(p_transactions)::text, 'sha256'), 'hex');
  existing_id uuid;
  selected_count integer := cardinality(p_transactions);
  owned_count integer;
begin
  if selected_count is null or selected_count = 0 then raise exception 'choose at least one individual entry'; end if;
  existing_id := private.assert_idempotency(p_actor, p_idempotency_key, 'settle_personal_transactions', payload_hash);
  if existing_id is not null then return; end if;

  select count(*) into owned_count
  from (
    select id
    from public.personal_transactions
    where user_id = p_actor and id = any(p_transactions)
    for update
  ) as locked_transactions;
  if owned_count <> selected_count then raise exception 'individual entry not found'; end if;

  update public.personal_transactions
  set status = 'settled', settled_at = now()
  where user_id = p_actor and id = any(p_transactions) and status = 'open';

  insert into public.idempotency_keys (actor_id, key, operation, request_hash, result_id)
  values (p_actor, p_idempotency_key, 'settle_personal_transactions', payload_hash, p_transactions[1]);
end;
$$;

revoke all on function public.app_settle_personal_transactions(uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.app_settle_personal_transactions(uuid, uuid[], text) to service_role;

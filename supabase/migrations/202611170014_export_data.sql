-- A person's own data, in one document, for Settings -> Export my data (JSON and CSV are built from it by the API).
--
-- What is in it: the account, the groups they belong to (with the other members' display names), every expense they
-- paid or share, every payment they sent or received, their private individual balances (with what is paid so far),
-- their saved people, the activity feed of the groups they are in, and a list of the emails LenaDena queued for them or
-- for their people.
--
-- What is NOT in it, on purpose:
--   * other people's email addresses (only display names, which the person already sees in the app);
--   * anything that belongs to someone else (their private balances, saved people, settings);
--   * expenses that were deleted;
--   * photos and receipt images. The rows say whether one exists; the files themselves are not exported.
-- Amounts are in minor units (1/100 of the currency), as everywhere else.
-- Safe to run more than once.

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
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.app_export_data(uuid) from public, anon, authenticated;
grant execute on function public.app_export_data(uuid) to service_role;

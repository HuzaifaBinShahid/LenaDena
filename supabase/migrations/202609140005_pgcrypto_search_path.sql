-- Supabase installs pgcrypto in the "extensions" schema, so `create extension if not exists pgcrypto`
-- in the initial migration was a no-op there. Every financial write function below pins
-- `search_path = public` and calls digest()/gen_random_bytes(), which then fail with
-- "function digest(text, unknown) does not exist". Add "extensions" to their search path.
-- Only function settings change; bodies, grants and ownership stay as they are.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter function public.app_create_group(uuid, text, text, text, text[], text) set search_path = public, extensions;
alter function public.app_create_invite(uuid, uuid, text) set search_path = public, extensions;
alter function public.app_accept_invite(uuid, text) set search_path = public, extensions;
alter function public.app_create_expense(uuid, jsonb, text) set search_path = public, extensions;
alter function public.app_claim_settlement(uuid, jsonb, text) set search_path = public, extensions;
alter function public.app_review_settlement(uuid, uuid, text, text, text) set search_path = public, extensions;
alter function public.app_self_confirm_settlement(uuid, uuid, text) set search_path = public, extensions;
alter function public.app_create_personal_transaction(uuid, jsonb, text) set search_path = public, extensions;
alter function public.app_settle_personal_transaction(uuid, uuid, text) set search_path = public, extensions;

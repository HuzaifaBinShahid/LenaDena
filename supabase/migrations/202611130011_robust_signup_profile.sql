-- Accounts now sign up directly with Supabase Auth (email and password), so anyone holding the app's public key can
-- create one with any name. The profile row the signup trigger writes must therefore never fail on odd input: the
-- profiles table only accepts a display name of 1 to 80 characters, and the old trigger copied whatever arrived,
-- which turned an empty or over-long name into a "Database error saving new user" that no one could act on.
--
-- Now the name is stripped of control characters, trimmed and cut to 80 characters; if nothing is left it falls back
-- to the part of the email before the @, and finally to "Friend". The trigger itself is unchanged and keeps using
-- this function. Safe to run more than once.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := left(nullif(trim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'name', ''), '[[:cntrl:]]+', ' ', 'g')), ''), 80);
  email_name text := left(nullif(trim(split_part(coalesce(new.email, ''), '@', 1)), ''), 80);
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), coalesce(clean_name, email_name, 'Friend'))
  on conflict (id) do nothing;
  return new;
end;
$$;

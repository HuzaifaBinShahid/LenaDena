# LenaDena Deployment

## Target

- Supabase Free: authentication, PostgreSQL, and private image storage.
- Render Free: Fastify API from the `main` branch using `render.yaml`.
- Expo: local development builds receive the public API URL and Supabase publishable values from `frontend/.env.local`.

## Supabase

The LenaDena Free project is provisioned in Supabase's Singapore region. The migrations through `202609130004` have been applied in filename order. The Auth site URL is `lenadena://`, with `lenadena://**` in the redirect allowlist.

Apply `202609140005_pgcrypto_search_path.sql` next (SQL editor or Supabase CLI). Supabase keeps pgcrypto in the `extensions` schema, and until this runs every financial write function fails with `function digest(text, unknown) does not exist`.

Then apply `202609180007_people.sql` (it includes 0006's column, so 0006 is optional before it; running 0006 first is also fine) (People: saved people, `person_id` on individual entries, backfilled from existing counterparties). 0007 needs 0006. If the new functions still answer "not found" afterwards, run `notify pgrst, 'reload schema';`. Until 0007 is applied the app keeps working: the plan returns no people and saving a person reports that the database needs the update.

Then apply `202611100010_person_emails.sql` (emails to people: per-person switches, the statement email with its PDF, new-entry notes, weekly and monthly reminders). It needs 0007 and `202611030009`. Redeploy the notification worker with it: the worker now depends on `pdfkit` and bundles the Manrope fonts under `dist/notifications/assets/fonts` (the `build` script copies them). Emails only leave the building when `SMTP_HOST` is configured; without it the worker just logs them. Until the migration is applied the app keeps working and the email buttons answer that the database needs the update.

### App download link and invites

Share-invite messages and invite emails link to the Loadly page `https://loadly.io/kzM0n7qg` by default (the app sends it with each invite; the API accepts Loadly links). When the app moves to Google Play, set `EXPO_PUBLIC_APP_DOWNLOAD_URL` in `frontend/.env.local` (restart Metro with `--clear`, rebuild) and/or `APP_DOWNLOAD_URL` in `backend/.env` (wins for emails). Invite and notification emails are only delivered while the worker runs with SMTP configured (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`).

## Hosted email worker (free, no server to look after)

Emails to people (statements, reminders, invites) are queued in the database and sent by a worker. Instead of a terminal on your computer, the Vercel API can send one small batch each time a scheduler calls it, and Supabase's own scheduler calls it every minute.

1. **Vercel environment variables** (Project → Settings → Environment Variables, then redeploy): `NOTIFICATIONS_CRON_SECRET` (make one with `openssl rand -hex 32`; keep a copy for step 3), and the mail settings the worker already uses: `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASSWORD` (the Brevo SMTP key), `SMTP_FROM`. `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are already there. Optional: `EMAIL_LINK_BASE_URL`, `APP_DOWNLOAD_URL`. Leave `ENABLE_GROUP_DEBT_REMINDERS` unset.
2. **Try it by hand** (expect `200` and JSON such as `{"claimed":0,"sent":0,"failed":0,"skipped":0}`; `401` means the secret is wrong, `404` that the variable is missing, `503` that the SMTP settings are missing):
   `curl -s -X POST -H "Authorization: Bearer <secret>" https://<your-api-host>/internal/notifications/run`
3. **Schedule it in Supabase** (Database → Extensions: enable `pg_cron` and `pg_net`; then the SQL editor). Keep the secret in Vault rather than in the job text:
   ```sql
   select vault.create_secret('<the same secret>', 'notifications_cron_secret');
   select cron.schedule('lenadena-notifications', '* * * * *', $$
     select net.http_post(
       url := 'https://<your-api-host>/internal/notifications/run',
       headers := jsonb_build_object('Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'notifications_cron_secret')),
       body := '{}'::jsonb,
       timeout_milliseconds := 30000);
   $$);
   ```
   Stop it any time with `select cron.unschedule('lenadena-notifications');`. See what happened with `select * from net._http_response order by created desc limit 5;`.
4. **Check the first real email**: tap Send on a person's page, wait a minute or two, and look at Brevo's transactional log.

**If the scheduler gets 401** (`select status_code from net._http_response order by created desc limit 5;`), the secret in Vault and the one in Vercel differ. Two checks that never show the secret: Vercel → Logs, search `scheduler secret rejected`, which prints `providedLength` (what the scheduler sent) and `configuredLength` (what Vercel holds); and in Supabase `select length(decrypted_secret) from vault.decrypted_secrets where name = 'notifications_cron_secret';` (64 for `openssl rand -hex 32`). Pitfalls met on 2026-11-14: copying a command out of a chat or page overwrites the clipboard, so the secret was gone before the next paste; and pasting into the Vault box once dropped a character (63 instead of 64). Keep the secret in a file (`umask 077; openssl rand -hex 32 | tr -d '\n' > ~/.lenadena-cron-secret`), copy it with `pbcopy < ~/.lenadena-cron-secret` right before each paste, test with `curl -H "Authorization: Bearer $(cat ~/.lenadena-cron-secret)" …`, check the Vault length, and `rm` the file when it works.

Each call sends at most 3 emails, so a minute-by-minute schedule is about 180 an hour: plenty for statements and the reminders owners switch on. A failed email is retried every five minutes. If you would rather run a machine that stays on, `pnpm worker` runs the same code as a loop.

### Branded Auth emails

`supabase/templates/` holds branded templates for all six Supabase Auth emails (sign-in link, confirm signup, invite, reset password, change email, reauthentication) and `subjects.json`.

- Apply them with a personal access token from https://supabase.com/dashboard/account/tokens:
  `SUPABASE_ACCESS_TOKEN=<token> node --env-file=backend/.env supabase/templates/apply.mjs`
  It uploads the logo to a public `brand` bucket (created if missing), fills in the logo URL and link expiry, and updates the Auth email settings.
- Without a token: add `--dry-run` to write the finished HTML to `supabase/templates/dist/` and paste each file into Dashboard → Authentication → Emails with the printed subject.
- **Free-plan projects created on or after 3 June 2026 cannot edit Auth email templates while they use Supabase's default sender**, and the default sender only delivers to project team members (about 2 emails an hour) as "Supabase Auth". Configure custom SMTP first (Authentication → SMTP; any provider such as Resend, Brevo or Postmark), turn off the provider's click tracking (it rewrites the one-time links), then run the script.
- Keep the redirect allowlist in step with the app's return addresses (`lenadena://**`, your Expo `exp://…/--/**` address, the web origin), or links open the Site URL instead.

Accounts sign up and sign in with email and password, so before opening the app to anyone set these in the Supabase dashboard (Authentication): **Providers → Email → Confirm email ON** and **Minimum password length 8**; **SMTP** with a custom provider (Brevo, Resend, Postmark) so people other than team members receive the confirm and reset emails; **URL configuration → Redirect URLs** includes `lenadena://**` (and your Expo development URL or web origin). Run migration `202611130011_robust_signup_profile.sql`. The API has no sign-in routes any more: it verifies the Supabase bearer token and refuses an unconfirmed email.

The backend needs:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

The frontend receives only:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Never place the secret key in the frontend or commit either local environment file.

## Render

Create a Blueprint from this repository. `render.yaml` installs the pnpm workspace, builds only the backend, starts the compiled Fastify server, and checks `/health`.

Render activation is currently deferred after card verification was declined. This does not affect local development against the hosted Supabase project.

After Render assigns the public service URL, set:

```text
EXPO_PUBLIC_API_URL=https://lenadena-api.onrender.com
```

Use the exact URL assigned by Render when the preferred subdomain is unavailable.

## Local verification against production

The ignored `backend/.env` runs Fastify locally in Supabase mode, while `frontend/.env.local` points Expo at the local API and hosted Supabase Auth. No secret key is exposed to the frontend or committed to Git.

Restart Expo after changing public environment variables:

```bash
pnpm --filter @lenadena/frontend exec expo start --clear
```

Verify the API:

```bash
curl https://YOUR-RENDER-SERVICE.onrender.com/health
```

The expected response contains `"status":"ok"`.

## Free-tier behavior

Render Free sleeps after 15 minutes without inbound traffic, so the first API call after idle can take about one minute. Supabase Free projects can pause after a week without activity. These plans are appropriate for development and friend-group testing, not an availability guarantee.

The current notification worker uses SMTP. Render Free blocks outbound SMTP ports 25, 465, and 587 and does not offer free background workers. Email delivery therefore needs either a paid worker, an SMTP provider supporting an allowed port such as 2525, or a future HTTPS email adapter.

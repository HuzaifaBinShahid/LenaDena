# LenaDena Deployment

## Target

- Supabase Free: authentication, PostgreSQL, and private image storage.
- Render Free: Fastify API from the `main` branch using `render.yaml`.
- Expo: local development builds receive the public API URL and Supabase publishable values from `frontend/.env.local`.

## Supabase

The LenaDena Free project is provisioned in Supabase's Singapore region. The migrations through `202609130004` have been applied in filename order. The Auth site URL is `lenadena://`, with `lenadena://**` in the redirect allowlist.

Apply `202609140005_pgcrypto_search_path.sql` next (SQL editor or Supabase CLI). Supabase keeps pgcrypto in the `extensions` schema, and until this runs every financial write function fails with `function digest(text, unknown) does not exist`.

Then apply `202609180007_people.sql` (it includes 0006's column, so 0006 is optional before it; running 0006 first is also fine) (People: saved people, `person_id` on individual entries, backfilled from existing counterparties). 0007 needs 0006. If the new functions still answer "not found" afterwards, run `notify pgrst, 'reload schema';`. Until 0007 is applied the app keeps working: the plan returns no people and saving a person reports that the database needs the update.

### App download link and invites

While the Android app is shared through Loadly, set the install link (printed as `Install:` after `pnpm build:apk`) as `EXPO_PUBLIC_APP_DOWNLOAD_URL` in `frontend/.env.local` (share-invite messages; restart Metro with `--clear`, rebuild the APK) and optionally `APP_DOWNLOAD_URL` in `backend/.env` (invite emails; wins over the app's link). Invite and notification emails are only delivered while the worker runs with SMTP configured (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`).

### Branded Auth emails

`supabase/templates/` holds branded templates for all six Supabase Auth emails (sign-in link, confirm signup, invite, reset password, change email, reauthentication) and `subjects.json`.

- Apply them with a personal access token from https://supabase.com/dashboard/account/tokens:
  `SUPABASE_ACCESS_TOKEN=<token> node --env-file=backend/.env supabase/templates/apply.mjs`
  It uploads the logo to a public `brand` bucket (created if missing), fills in the logo URL and link expiry, and updates the Auth email settings.
- Without a token: add `--dry-run` to write the finished HTML to `supabase/templates/dist/` and paste each file into Dashboard → Authentication → Emails with the printed subject.
- **Free-plan projects created on or after 3 June 2026 cannot edit Auth email templates while they use Supabase's default sender**, and the default sender only delivers to project team members (about 2 emails an hour) as "Supabase Auth". Configure custom SMTP first (Authentication → SMTP; any provider such as Resend, Brevo or Postmark), turn off the provider's click tracking (it rewrites the one-time links), then run the script.
- Keep the redirect allowlist in step with the app's return addresses (`lenadena://**`, your Expo `exp://…/--/**` address, the web origin), or links open the Site URL instead.

Instant email sign-in is never enabled on Render: `NODE_ENV=production` disables it regardless of `ALLOW_INSTANT_AUTH`, and the app falls back to Supabase email links. Add the email-link redirect URLs you use (for example your Expo development URL) to the Supabase Auth allowlist.

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

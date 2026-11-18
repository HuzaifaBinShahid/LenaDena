# LenaDena Deployment

## Target

- Supabase Free (Singapore): authentication, PostgreSQL, private image storage, and the scheduler (`pg_cron`) that triggers the email worker.
- Vercel (project `lena-dena-backend`): the Fastify API at `https://lena-dena-backend.vercel.app`, deployed from the `main` branch (Vercel finds the default export of `backend/src/app.ts`), plus the public privacy policy and account deletion pages.
- Render: a blueprint (`render.yaml`) exists but was never activated and is not used.
- Android: built on the developer's Mac with Gradle and uploaded to Loadly (`frontend/scripts/build-and-upload-android.sh`). Pin the API address in the build command, `EXPO_PUBLIC_API_URL=https://lena-dena-backend.vercel.app`, so an APK never embeds a local address. Local development builds read the public API URL and Supabase publishable values from `frontend/.env.local`.

## Supabase

The LenaDena Free project is provisioned in Supabase's Singapore region. Every migration through `202611170013` was checked against the database catalog on 2026-11-17. The owner applied `202611170014`, `202611170015` and `202611170016` afterwards (reported, not checked from the repository) and `202611180017_payment_push_and_health.sql` is written but not applied (see "Data export", "Group management", "Push notifications" and "Payment notifications and the health check" below). Once 0017 is applied, `GET /health/ready` names whichever migration is still missing in the log, so check it instead of querying the catalog by hand. For a fresh project apply every file in filename order; the notes that follow say what the ones that need care switch on. The Auth site URL is `lenadena://`, with `lenadena://**` in the redirect allowlist.

`202609140005_pgcrypto_search_path.sql` (SQL editor or Supabase CLI) matters on a fresh project. Supabase keeps pgcrypto in the `extensions` schema, and until this runs every financial write function fails with `function digest(text, unknown) does not exist`.

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

### Edit and delete

`supabase/migrations/202611170013_edit_delete_entries.sql` switches on editing and deleting of expenses and individual balances (applied on the hosted project on 2026-11-17; safe to re-run). On a database without it the app shows no Edit or Delete and the API answers 503 `edit_unavailable` for those routes. Deploy the API first, then apply the migration, then release the app; or apply the migration first, since the older API simply ignores the new fields.

### Data export

Apply `supabase/migrations/202611170014_export_data.sql` (SQL editor or Supabase CLI; safe to re-run) to switch on Settings -> Export my data. It adds one read-only function, `app_export_data`, that builds the person's own records as a single document; the API turns it into a JSON or CSV file (`GET /v1/me/export?format=json|csv`). Until it is applied the route answers 503 `export_unavailable` and the app shows an error when someone taps Export. Deploy the API first or apply the migration first: either order is safe. The app needs a new build (it uses `expo-file-system`).

### Group management

Apply `supabase/migrations/202611170015_group_members.sql` (safe to re-run) to switch on adding people by email with an in-app accept or decline, the members list, leaving, removing and renaming. Until it is applied the routes answer 503 `groups_unavailable` and the new screens say so. It adds the balance helpers it needs (`private.group_balance`, `member_is_settled`, `pair_balance`) and works on top of the earlier files. Apply it before releasing the app that has the Manage members screen; the API can be deployed before or after.

### Push notifications (Firebase Cloud Messaging, free)

Apply `supabase/migrations/202611170016_push_notifications.sql` (safe to re-run; apply 0014 and 0015 first, since reminders use 0015's balance helper; it also redefines `app_export_data` and `app_delete_account` to cover devices and reminders). Then set up Firebase. Nothing here costs money: FCM has no charge and the Spark plan needs no card.

1. **Firebase project.** console.firebase.google.com -> Add project (Google Analytics can stay off).
2. **Android app.** In the project, add an Android app with the package name `com.lenadena.app` (no SHA-1 is needed for notifications). Download `google-services.json` and put it at `frontend/google-services.json`. It is git-ignored; it holds identifiers, not secrets, but the file belongs on the Mac that builds the APK (`GOOGLE_SERVICES_JSON=/path/to/file` points the build elsewhere).
3. **Service account for the API.** Project settings -> Service accounts -> Generate new private key. In Vercel (Project -> Settings -> Environment Variables) add `FIREBASE_SERVICE_ACCOUNT_JSON` with the whole JSON (or the same JSON in base64: `base64 -i key.json | tr -d '\n'`), then redeploy. It is a secret: never commit it and delete the downloaded file afterwards. Check that "Firebase Cloud Messaging API (V1)" is enabled for the project (Project settings -> Cloud Messaging; it is on by default in new projects).
4. **A new APK.** The app needs a native rebuild because it gained a native module and notification permission: with `frontend/google-services.json` in place, build and upload as usual (`frontend/scripts/build-and-upload-android.sh`, with `EXPO_PUBLIC_API_URL=https://lena-dena-backend.vercel.app` pinned). A build without that file is exactly the app as before: no notification permission, and no Notifications card in Settings. iOS and Expo Go never show it.
5. **Try it with two phones.** On phone B: Settings -> Notifications -> turn on "Reminders from friends" and allow the permission. On phone A, in a group where B owes A money: Group -> Manage members -> Remind next to B. B should get "A sent you a reminder"; tapping it opens the group. Also invite B's email from A's Members screen: B gets "A invited you to ..." and sees the invitation in the app.
6. **If it does not work.** No Notifications card: the build has no `google-services.json`, or it is iOS / Expo Go. The switch says the server isn't set up: `FIREBASE_SERVICE_ACCOUNT_JSON` is missing or unusable (Vercel logs show "FIREBASE_SERVICE_ACCOUNT_JSON is set but is not a usable service account key" at start). Remind says it couldn't send: Google refused the service account (is it from the same Firebase project as `google-services.json`, and is the V1 API enabled?); the reminder is undone, so trying again later is fine. Remind offers the share sheet and says the person isn't getting notifications: they have not switched them on, or their token was reported dead and deleted.
7. **Limits and privacy.** One reminder per person per group per day, 15 a day. Reminder records are deleted after a week. A notification shows the amount and group on the lock screen. The policy page (`/privacy`) names Firebase Cloud Messaging and describes all of this.

### Payment notifications and the health check (migration 0017)

Apply `supabase/migrations/202611180017_payment_push_and_health.sql` in the SQL editor (safe to re-run; apply 0016 first). It adds `push_events` (one row per payment step that was announced, deleted after a week), `app_get_payment_push_target` and `app_health_check`, both executable by the service role only. No new Vercel variable and no new APK is needed for the server side: once the API is deployed, a payer saying "I paid", a recipient confirming or flagging it, and the payer settling it after the review window each send a notification to the other person if they switched notifications on. The prompt that asks people to switch them on and the tap that opens the Payments tab are in the app, so they arrive with the next APK. Until 0017 is applied the API still works; each payment step then logs a warning ("payment push failed") and the health check reports `migrations: "unknown"`.

Then check it: `curl -s https://lena-dena-backend.vercel.app/health/ready` should say `"status":"ok"` with `"migrations":"ok"`.

### Health check and monitoring

Two endpoints, both public and cheap: `GET /health` (the function runs; always 200) and `GET /health/ready` (the database and Supabase Auth answer, every migration is applied, a Firebase key that is set is usable). `/health/ready` answers 200 with `"status":"ok"` or `"degraded"` (it works but something needs attention), and **503** with `"status":"down"` when the database or Auth does not answer. Its body only says which kind of thing is wrong (`checks.database`, `auth`, `migrations`, `push`); the details are in the Vercel logs as "health: ..." warnings. It looks at most once every 10 seconds, so it is safe to poll every minute.

To be told when it breaks, point a free uptime monitor at it (UptimeRobot, Better Stack, cron-job.org with e-mail on failure all work): URL `https://lena-dena-backend.vercel.app/health/ready`, check every 5 minutes, alert on a status other than 200, and (optional) alert when the page does not contain `"status":"ok"` so a `degraded` shows up too.

**Reading the logs** (Vercel -> the project -> Logs, or `vercel logs`): every request is one line, `request`, with `route`, `status`, `ms` (the whole request) and `upstreamMs` (time spent waiting on the database, Supabase Auth and Firebase). Search for `slow request` (took at least `SLOW_REQUEST_MS`, default 1500) and `failed call to another service` first; the `upstream` field lists the slowest calls, for example `db rpc app_get_plan 212ms`, `auth user 640ms`, `fcm send 180ms`. If `ms` is large and `upstreamMs` is small the time went here (a cold start, a big response); if they are close, it went to the other service. Set `SLOW_REQUEST_MS` in Vercel to change the threshold.

### Privacy policy and account deletion pages

Both stores ask for two public web addresses. The API serves them, with no sign-in and no script:

- `https://<your-api-host>/privacy` (today `https://lena-dena-backend.vercel.app/privacy`)
- `https://<your-api-host>/delete-account`

Set these in Vercel (Project → Settings → Environment Variables), then redeploy:

- `SUPPORT_EMAIL`: the address people write to. It is shown to everyone, so use one you are happy to publish and will read. Without it the pages say no address is published yet and deletion by email is not offered. An invalid value is ignored (the API logs a warning at start) instead of stopping the API.
- `OPERATOR_NAME` (optional): the person or company that runs the app, named on both pages. Make it match the developer name on your store listing. Without it the pages say "the LenaDena team".

Then check them in a browser (they should show your address, as a mail link) and enter the two links in the store forms:

- Google Play Console: the privacy policy link (App content) and the account deletion link in the Data safety form.
- App Store Connect: the Privacy Policy URL (App Information). The app also links to it from Settings → Privacy policy, which Apple wants.

The text lives in `backend/src/pages/privacy.ts` and `deleteAccount.ts` and describes what the app does today. When the app collects something new, or stops, change the text and `POLICY_UPDATED` (in `layout.ts`) in the same commit. It is written in good faith from the code but it is not legal advice: have someone who knows the rules where you operate read it before launch.

#### Deletion requests by email

The deletion page tells people who cannot open the app to email you from the address on their account. To carry out a request (the page promises 30 days):

1. Check it really is the account owner: the email must come from the address on the account. If in doubt, reply and ask a question only they could answer (for example the name of a group they are in).
2. See what would be removed, changing nothing (needs `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `backend/.env`):
   `pnpm --filter @lenadena/backend delete-account -- person@example.com`
3. Delete for good, with the same steps as the in-app deletion (files first, then the records, then the sign-in):
   `pnpm --filter @lenadena/backend delete-account -- person@example.com --yes`
4. Reply to the person that it is done. If the command stops with an error, run it again: it is safe to repeat.

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

## Render (not used)

The API runs on Vercel. This section only matters if Render is ever used instead. Create a Blueprint from this repository. `render.yaml` installs the pnpm workspace, builds only the backend, starts the compiled Fastify server, and checks `/health`.

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
curl https://lena-dena-backend.vercel.app/health
curl https://lena-dena-backend.vercel.app/health/ready
```

The first (liveness) contains `"status":"ok"`; the second (database, Auth, migrations, push) contains `"status":"ok"` when everything is in order.

## Free-tier behavior

A Vercel function that has been idle starts cold, so the first call after a quiet period can take a moment. Supabase Free projects can pause after a week without activity and do not promise backups. These plans are appropriate for development and friend-group testing, not an availability guarantee.

The notification worker sends over SMTP (Brevo, port 587), which works from a Vercel function; the hosted pass is triggered every minute by Supabase's scheduler (see "Hosted email worker"). Render Free blocks outbound SMTP ports and has no free background workers, which is why it is not used.

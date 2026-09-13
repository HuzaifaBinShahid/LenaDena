# LenaDena Deployment

## Target

- Supabase Free: passwordless authentication, PostgreSQL, and private image storage.
- Render Free: Fastify API from the `main` branch using `render.yaml`.
- Expo: local development builds receive the public API URL and Supabase publishable values from `frontend/.env.local`.

## Supabase

The LenaDena Free project is provisioned in Supabase's Singapore region. Every SQL file under `supabase/migrations/` has been applied in filename order. The Auth site URL is `lenadena://`, with `lenadena://**` in the redirect allowlist.

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

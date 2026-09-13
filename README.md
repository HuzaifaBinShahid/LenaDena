# LenaDena

LenaDena tracks open balances between friends: what you owe, what is owed to you, and what has already been settled. Groups support shared costs and verified payments, while private individual entries work without creating a group.

The repository contains two applications:

- `frontend/` — Expo and React Native mobile app using NativeWind.
- `backend/` — Node.js and Fastify API using Supabase when configured and a safe in-memory demo store otherwise.

The canonical technical identifiers are `lenadena` for the Expo slug and deep-link scheme, `com.lenadena.app` for iOS and Android, and `@lenadena/*` for workspace packages. The app icon and animated splash use the shared violet LD monogram.

## What is implemented

- Passwordless email accounts with persistent profiles, editable names, private profile-photo uploads, and a no-credentials demo path.
- Personal My plan dashboard.
- Individual expense and loan balances that do not require a group or invite.
- User-created groups with invites, balances, and activity.
- Hashed, expiring, single-use invite links with email-bound acceptance when an address is supplied.
- Equal, exact-value, and percentage expense splits.
- Required event name and system-picked event date displayed in day–full month–year order.
- Payment claims with optional proof, recipient review, confirmation, needs-attention handling, and an audited payer fallback when the recipient has never opened the app or leaves a claim unreviewed for 72 hours.
- WhatsApp/native share intake route for receipt photos.
- Receipt selection, OCR adapter, multilingual on-device voice adapter, and manual fallbacks.
- Private receipt, proof, and profile-photo uploads through Fastify into Supabase Storage.
- Persisted Dusk, Cloud, Midnight, and system-following themes.
- Friendly, cheeky, chaos, and quiet notification tones.
- Reusable `Button`, `Input`, `Field`, `TopTabs`, `Spinner`, `Text`, semantic `Icon`, person-avatar, and group-avatar primitives.
- A compact modern design system with floating bottom navigation, purple glass surfaces, strong financial hierarchy, and a readable pale workspace.
- A three-stage expense flow that keeps Details, Split, and Finish short, with Note placed last.
- An Add entry chooser with focused Individual and Group paths.
- Private individual obligations for `I owe` and `Owed to me`, created as open and retained in Activity after being marked settled.
- A transaction-first Activity tab with owed/owing totals and date, source, group, type, balance-side, and status filters.
- Locally bundled Manrope typography with no font API or runtime server dependency.
- A composed Reanimated splash with orbiting expense cues, staged wordmark reveal, progress motion, reduced-motion handling, and no runtime blur.
- Supabase migration with row-level security policies.
- Fastify route schemas, authentication hook, request IDs, rate limiting, security headers, and injection tests.
- An SMTP notification worker with locked outbox delivery, retries, and 72-hour reminder throttling.

## Requirements

- Node.js 22.13 or newer. Node.js 24 LTS is recommended.
- pnpm 11.19.0.
- Expo development build for speech recognition, OCR, and full inbound share testing.
- iOS 16.4 or newer for the configured Expo SDK and ML Kit OCR engine.
- A Supabase project for persistent multi-user data. Credentials are optional for demo mode.

## Install

If `node` is not available on macOS, install Node.js 24 LTS using the macOS installer from [nodejs.org](https://nodejs.org/en/download), then close and reopen Terminal.

Install the project pnpm version once:

```bash
curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=11.19.0 sh -
exec zsh
node --version
pnpm --version
```

From the repository root, install and configure the apps:

```bash
pnpm install
cp frontend/.env.example frontend/.env.local
cp backend/.env.example backend/.env
```

## Run

Start the API:

```bash
pnpm dev:backend
```

Start Expo in another terminal:

```bash
pnpm dev:frontend
```

After a NativeWind, Metro, font, or navigation-shell change, restart Expo once with a clean cache:

```bash
pnpm --filter @lenadena/frontend exec expo start --clear
```

Expo Router owns the root navigation container through `src/app/_layout.tsx`; do not add a second `NavigationContainer` around the app.
Shared tabs and inputs use raw React Native interactive nodes so NativeWind styling cannot interfere with press or focus state.

When Supabase mode is enabled, start the email worker in a third terminal:

```bash
pnpm dev:worker
```

The frontend defaults to `http://localhost:3000`. For a physical phone, set `EXPO_PUBLIC_API_URL` to the computer's LAN address, such as `http://192.168.1.10:3000`.

## Demo mode

Leave Supabase values empty and keep `AUTH_MODE=demo` in `backend/.env`. The app uses the seeded `demo-user` identity, so the main workflow can be tested immediately.

## Supabase mode

1. Create a Supabase project.
2. Run the files in `supabase/migrations/` in filename order using the SQL editor or Supabase CLI.
3. Set the frontend URL and publishable key.
4. Set the backend URL, publishable key, and secret key.
5. Change backend `AUTH_MODE` to `supabase` and restart both apps.
6. Add SMTP settings and start the notification worker.

The frontend uses Supabase only for authentication. Financial mutations go through Fastify with the bearer token. Never place the Supabase secret key in the frontend.

Supabase Auth creates one profile per verified email account. Financial rows continue to reference the immutable account ID when a user changes their display name or photo. `last_seen_at` distinguishes a recipient who has never opened LenaDena from an active recipient who still has a 72-hour review window.

`SMTP_HOST` is optional in development, where the worker renders messages to JSON instead of sending them. It is required when `NODE_ENV=production`. Any normal SMTP provider can be used; no AI service or AI API key is involved.

## Device features

- Voice transcription uses an on-device speech model. Set `system` or any installed BCP-47 locale such as `ur-PK`, `ar-SA`, `hi-IN`, or `fr-FR` under Settings.
- Expo Go does not include the speech-recognition native module. The microphone control displays a development-build prompt there without loading the unavailable package or interrupting the form.
- The system date picker is included in Expo Go; the database and API continue to receive timezone-safe `YYYY-MM-DD` calendar values.
- OCR runs on the device and only suggests receipt fields; the user reviews event name, event date, and amount before saving.
- A WhatsApp image shared to LenaDena opens the import route and continues into the same expense form.
- Voice, OCR, and inbound sharing need a development build. The manual workflow remains available when a native module or language model is unavailable.

## Native development build

The app remains navigable in Expo Go, but voice recognition, native OCR, and complete inbound sharing require native modules:

```bash
cd frontend
pnpm exec expo prebuild
pnpm exec expo run:ios
```

Use `pnpm exec expo run:android` for Android. The generated native folders are intentionally ignored and can be regenerated from `app.config.ts`.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm run doctor
```

`expo install --check` reports the SDK dependencies as current, and Expo Doctor passes all 21 checks in the configured local toolchain.

## Project memory

Read `PROJECT_MEMORY.md` before changing architecture, domain terminology, security rules, or component conventions. Update it when a durable decision changes.

See `ARCHITECTURE.md` for component boundaries, request flows, API routes, data ownership, and the production checklist. See `DESIGN_SYSTEM.md` for the visual direction and UI rules.

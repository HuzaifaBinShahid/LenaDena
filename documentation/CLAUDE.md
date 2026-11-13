# LenaDena — Project Guide

LenaDena ("lena-dena", give-and-take) tracks open balances between friends: what you owe, what is owed to you, and what has been settled. It never moves money. Groups split shared costs and verify payments; private individual entries work without a group.

This file is the fast path into the codebase for AI agents and new contributors. Deeper references: [README.md](../README.md) (setup), [ARCHITECTURE.md](ARCHITECTURE.md) (flows, API table), [PROJECT_MEMORY.md](PROJECT_MEMORY.md) (durable product/UI/backend contracts — read before changing rules), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (visual rules), [DEPLOYMENT.md](DEPLOYMENT.md) (Supabase/Render).

## Stack

| Layer | Tech |
| --- | --- |
| Mobile/web client | Expo SDK 57, React Native 0.86 (new architecture), React 19.2, Expo Router 57 (typed routes), NativeWind 4 + Tailwind 3, Reanimated 4.5 + worklets, Gesture Handler 2.32, react-native-svg 15, expo-local-authentication + expo-secure-store, TypeScript 6 |
| API | Node 24, Fastify 5, TypeBox schemas, `@fastify/rate-limit`, helmet, multipart, swagger (non-prod at `/documentation`) |
| Data/Auth | Supabase (Auth, Postgres RPC functions with RLS, private Storage buckets), hosted project in Singapore |
| Worker | Node SMTP notification worker over a locked outbox table |
| Tooling | pnpm 11 workspace (`frontend`, `backend`), Vitest 4 |

## Commands (repo root)

```bash
pnpm dev:backend        # Fastify on :3000 (loads backend/.env)
pnpm dev:frontend       # Expo dev server
pnpm dev:worker         # notification worker (Supabase mode)
pnpm typecheck          # both packages — note: pnpm -r stops at the first failing package
pnpm test               # Vitest in both packages
pnpm check:nativewind   # fails if a stale NativeWind/css-interop copy could split native styling
pnpm build              # backend tsc + Expo web export
pnpm --filter @lenadena/frontend exec expo start --clear   # after NativeWind/Metro/font/navigation-shell changes
```

## Runtime modes and environment

- **Demo mode**: no Supabase values, `AUTH_MODE=demo`. Backend uses `MemoryLedgerRepository` with seeded data; client sends `x-user-id: demo-user`.
- **Supabase mode**: frontend has `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; backend has `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `AUTH_MODE=supabase`. The local `.env` files currently point at the hosted project.
- Accounts use Supabase Auth directly (email + password). The backend has no sign-in routes: it only checks the bearer token and that the email is confirmed. See "Authentication" below.
- Never read, print, or commit `backend/.env` or `frontend/.env.local`. The Supabase secret key must never reach the frontend.
- `EXPO_PUBLIC_API_URL` defaults to `http://localhost:3000`; a physical phone needs the computer's LAN IP.

## Repository map

```text
frontend/src/
  app/                     Expo Router screens
    _layout.tsx            provider tree (order matters, see below)
    index.tsx              home: Plan / Groups / Reviews / Activity tabs, redirects to /auth when signed out
    auth.tsx               create account / sign in
    settings.tsx           account, profile photo, theme, email tone, voice locale, app lock
    expense/new.tsx        3-step group expense (Details, Split, Finish)
    transaction/new.tsx    private individual obligation
    settlement/new.tsx     "I paid" claim;  settlement/[id].tsx  review / fallback settle
    group/new.tsx, group/[id].tsx, invite/[token].tsx, share.tsx (WhatsApp image intake)
    people/index.tsx       People list;  person/[id].tsx  person + history;  person/new.tsx  add / edit (?id=)
  components/ui/           the single reusable primitives (Button, Input, Field, TopTabs, Spinner,
                           Text, Icon, Avatar, GroupAvatar, Badge, Touch, Screen, Switch, Toast,
                           BottomSheet (the only sheet shell), DatePickerSheet (the app's own date picker))
  components/layout/       PageHeader, AppHeader, SectionHeader, EmptyState
  components/brand/        BrandMark (app-icon tile + wordmark), CoinMark (split gold coin, the logo), SplashTransition,
                           SpaceBackdrop (SVG scene for auth/lock), Clay (3D clay illustrations)
  features/auth/           AuthProvider (password sign-up/in, reset, change, email-link codes), useAuthForm, password/authErrors/authLinks (pure rules), goToSignIn
  features/security/       app lock: biometric capability, preference storage, lock provider and screen
  features/ledger/         LedgerProvider (all API mutations), types, split math, selectors, demo data
  features/preferences/    theme / email tone / voice locale (expo-sqlite localStorage)
  features/capture/        on-device OCR + speech adapters (native-module guarded)
  features/home/           tab views (+ homeChrome: per-tab top surface / status bar)
  features/people/         People: pure helpers (balances, search, tints), PeopleStrip (home), PersonPicker, routes
  features/settings/       AppearancePicker (Light / Dark / System previews)
  components/people/       PersonAvatar, PersonRow, PersonChip, PersonHeroCard, BalanceChip
  lib/                     api.ts (fetch + ApiError), supabase.ts, format.ts
  theme/tokens.ts          static light colour + motion tokens (frozen screens, always-dark UI)
  theme/palettes.ts        light + dark palettes (same keys as tokens); ThemeProvider.tsx: useTheme(), makeStyles()
backend/src/
  app.ts                   plugin registration + shared error contract
  config.ts                env parsing (AppConfig)
  plugins/auth.ts          resolves bearer token -> request.authUser; refuses unconfirmed emails (403 email_not_confirmed)
  plugins/repository.ts    Memory vs Supabase repository
  routes/                  health.ts, ledger.ts (all financial routes),
                           people.ts (/v1/people CRUD)
  http/schemas.ts          TypeBox request/response schemas
  repositories/            LedgerRepository interface + Memory and Supabase adapters
  domain/                  money rules, types, DomainError family
  notifications/, worker.ts  branded email layout + per-event templates (CID logo), preview script (preview:emails)
supabase/migrations/       schema, RLS, storage buckets, transactional app_* RPC functions,
                           handle_new_user trigger (creates profiles from auth.users + metadata.name)
supabase/templates/        branded Supabase Auth email templates + apply.mjs (Management API; see DEPLOYMENT.md)
```

Provider order in `_layout.tsx`: `GestureHandlerRootView > SafeAreaProvider > ToastProvider > PreferencesProvider > AuthProvider > LedgerProvider > AppLockProvider > Stack`, with `SplashTransition` rendered after the providers. Stacking (zIndex/elevation): app < lock overlay (45) < splash (50) < toasts (1000/100). The lock screen reads `useLedger()` for the name, so it must stay inside `LedgerProvider`.

## Authentication (current state)

- **Create account**: name + email + password -> `supabase.auth.signUp` (PKCE flow, `data: { name }`). With "Confirm email" on in the dashboard there is no session until the emailed link is opened; the form shows "Check your email" (resend with a 60 s cooldown). The DB trigger `handle_new_user` makes the profile (name cleaned, trimmed, cut to 80, falls back to the email name, then "Friend"; migration `202611130011`). Signing up with an existing email answers the same as a new one (no account enumeration).
- **Sign in**: `signInWithPassword`. `email_not_confirmed` shows the check-email view; `invalid_credentials` shows one message for wrong email or wrong password. Legacy accounts created email-only have no password: they use "Forgot password".
- **Email links** (confirm, reset) open the app with `?code=` (PKCE). `AuthProvider` parses it with `authLinks.parseAuthLink` and calls `exchangeCodeForSession`; only the phone that asked holds the code verifier, so another phone cannot use the link. `PASSWORD_RECOVERY` sets `recovering`, and `RecoveryRedirect` (in `_layout.tsx`) opens `/reset-password`. Tokens in URLs (`access_token`, `refresh_token`) are ignored on purpose.
- **Password rules** (`password.ts`): at least 8 characters, a letter and a number, at most 72 bytes (bcrypt). Unicode aware. The server's own minimum (dashboard) must be 8 or more.
- **Change password** (`/change-password`): asks the current password (re-auth), then `updateUser`, then `signOut({ scope: "others" })` so any other session stops working. **Reset** (`/reset-password`): new + confirm, same follow-up. An unfinished reset is remembered in storage (`lenadena.recovery-pending`, by user id), so killing the app before choosing a password still leads back to the reset screen. A reset request answers the same for every address, a rate limit included (Supabase only rate-limits addresses that have an account). Link errors show mapped copy only, never the link's own text.
- **Biometric sign-in** (iOS and Android): after a password sign-in the app offers "Sign in with Face ID next time?"; Settings → Sign-in has the switch. The password is stored with `expo-secure-store` `requireAuthentication` (hardware-bound where `canUseBiometricAuthentication()`; otherwise a "gated" fallback where `authenticateAsync` accepts the phone passcode too, and the app says so), under `WHEN_PASSCODE_SET_THIS_DEVICE_ONLY`. There is one credential slot per phone: a second account that accepts the offer replaces the first. Backing out of a re-save prompt keeps the stored value. If the biometric set changes, the key is invalidated and the next attempt falls back to the password. A stored password that no longer works (changed elsewhere) is deleted. Changing/resetting the password refreshes it. Emulators do not enforce biometrics; test on devices.
- **API guard**: every `/v1` route (decided from the matched route, so a percent-encoded path such as `/%76%31/...` meets the same check) needs a Supabase token whose user has `email_confirmed_at` (group invites match the profile email, so an unproven address must not reach data). 403 `email_not_confirmed` otherwise; 503 `auth_unavailable` when Supabase Auth is unreachable. With "Confirm email" off, Supabase sets `email_confirmed_at` itself, so the dashboard setting stays the real control; the API check is a second lock.
- **Known follow-ups from the 2026-11-13 review**: (1) at cutover, sessions created by the removed email-only route stay valid until they expire: delete the rows in `auth.sessions` and `auth.refresh_tokens` once (signs everyone out; the owner decides). (2) PKCE codes are matched to the newest verifier: a second reset request makes the first email's link fail, and a forged `lenadena:///?code=…` link can use up the pending verifier; the fix is `auth.experimental.appendPkceFlowIdToRedirects` plus `exchangeCodeForSession(code, { flowId })`, to be checked against the hosted GoTrue first. (3) The Auth email templates greet the sign-up name (HTML-escaped by Supabase, and the form caps it at 80), but anyone holding the public key can start a confirmation email to any address with a name of their choosing; drop `.Data.name` from the templates if that matters.
- The service role has **no direct table privileges** on the hosted project (all DB access is `app_*` SECURITY DEFINER RPCs). Auth helpers must use only the Auth admin API, never `from("profiles")`.
- Verified on 2026-11-13 in the web build against a local fake of Supabase Auth (sign-up, confirm link, unconfirmed sign-in, wrong password, change password, forgot + reset, expired link). Native biometric prompts are not verified (no device); the hosted project was not touched.
- **Stale sessions**: a 401 from `/v1/me/plan` is confirmed with `supabase.auth.getUser()` before signing the device out locally (`LedgerProvider`), so a deleted account lands on `/auth` but a network hiccup never signs anyone out. The API answers 503 `auth_unavailable` (not 401) when Supabase Auth is unreachable.
- **Dashboard settings the code relies on** (Authentication in Supabase): Confirm email ON, minimum password length 8, custom SMTP (Brevo) so strangers get the emails, redirect URL `lenadena://**` (and the web origin). Without custom SMTP only team members receive auth emails.
- **App lock** (`features/security`): optional per-account biometric lock (Face ID / Touch ID / fingerprint / face unlock, device passcode fallback) enabled in Settings, with a lock delay. Preference lives in SecureStore. An identity with the lock on stays locked until it passes a biometric check **in this run** (`verified` set keyed by email; unlock, enabling, a password sign-in (`markPasswordSignIn`) and a biometric sign-in add to it, sign-out clears it) — this covers restored sessions and sessions that reappear after an offline refresh. Returning from background after the delay locks again (negative elapsed time locks). The lock is an overlay (navigation state survives; `ScreenObscuredContext` hides native modals; Android back is consumed); a privacy cover hides the iOS app-switcher snapshot. Flows the app opens (`runWithoutLocking()` pickers/share/permission dialogs, biometric prompts) get a bounded 3-minute grace, never a free pass. With no device credential left, `turnOffWithoutCredential()` lets the owner switch it off. Lock and biometric sign-in are independent switches. The account that enabled biometric sign-in is remembered for the "Or continue with Face ID" shortcut (email never prefilled; the password sits behind biometrics only). Expo Go on iOS cannot use Face ID (no `NSFaceIDUsageDescription`), so iOS falls back to the passcode there; Face ID works in a development build. On-device prompts have not been exercised yet (no CocoaPods on the dev Mac).

## Conventions that bite

- **The auth screen is frozen (product owner, 2026-09-14: "make sure that the auth screen remain untouchable ... always").** Never change `frontend/src/app/auth.tsx`, `components/brand/SpaceBackdrop.tsx`, or `features/security/LockScreen.tsx` (which shares the look) during other design work. The primitive paths they render — `Button` `gradient` variant, `Input`/`Field` `dark` appearance, `BrandMark` `tone="light"`, `Text`, `Touch`, `Icon` — must keep rendering identically: add new variants or components instead of changing those paths, and re-screenshot `/auth` on the iOS simulator after touching any shared primitive. The one sanctioned change (owner, 2026-09-18: "LD does not look good"): `BrandMark` now draws the split-coin logo (`CoinMark`) instead of the "LD" letters — same tile, sizes and wordmark. The auth screen and lock screen stay dark in both app themes (they use static colours only).
- **Split NativeWind runtime after dependency changes (2026-09-14 incident).** Adding a frontend package (react-native-svg) changed pnpm's peer hash for `react-native-css-interop`/`nativewind` and left the old `node_modules/.pnpm` copies behind. A Metro started without `--clear` resolved app code to the stale copy while the Tailwind stylesheet registered into the new one, so **every className style disappeared on iOS** (black text, collapsed rows, nav bar at the top) while Expo web looked perfect. After ANY frontend dependency change: `pnpm check:nativewind` (also runs as `postinstall --fix`), restart Metro with `pnpm --filter @lenadena/frontend exec expo start --clear`, and verify on the iOS simulator — web screenshots cannot prove native styling. Quick proof of a split: the iOS dev bundle (`/frontend/node_modules/expo-router/entry.bundle?platform=ios&dev=true&minify=false`) contains more than one `react-native-css-interop@0.2.6_<hash>`.
- **Native QA without touching the owner's account**: `xcrun simctl io booted screenshot`, `xcrun simctl openurl booted "exp://127.0.0.1:8081/--/<route>"`, and a throwaway account signed in through the email-link handler (`exp://127.0.0.1:8081/--/#access_token=...&refresh_token=...`). Delete throwaway accounts afterwards.
- **Dark mode (2026-09-18).** Appearance is Light / Dark / System (`usePreferences().theme`, stored locally; `profiles.theme` still stores the legacy names dusk/midnight/system). One switch drives NativeWind (`colorScheme.set`) and, on native, `Appearance`, so keyboards and pickers follow. Tailwind colours are CSS variables (`global.css` `:root` / `.dark:root`, mirrored in `theme/palettes.ts`) — `bg-raised text-ink border-line` switch automatically; `white`, `night`, `lavender`, `lime`, `violet-strong` are constant. In StyleSheets use `makeStyles((c, { isDark }) => …)` or `useTheme().colors`; the static `colors` from `theme/tokens` is only for frozen screens and deliberately constant colours (white on violet, always-dark shells). Dark rules: canvas < raised < surface by lightness, a 1px `line` border on cards/sheets in dark (shadows vanish), never `bg-white` as a surface, brand shells use `shell`/`plum`, scrims use `backdrop`. `usePreferences().palette` is deprecated.
- **Selection states must be unmistakable** (owner: the old white-on-lilac segment was too subtle). The segmented `TopTabs` slides a solid pill (violet, or `tone: "coral" | "mint" | "gold"` per tab — coral for "I owe", mint for "Owed to me"); chips/radios/swatches use a solid fill or a 2px violet ring + check.
- **Keyboard**: forms render inside `Screen`, whose `KeyboardAwareScrollView` (react-native-keyboard-controller, `KeyboardProvider` in `_layout`) keeps the focused field 72pt above the keyboard. Don't add nested ScrollViews/KeyboardAvoidingViews to forms.
- **Voice input** shows three bouncing dots (`Input` `listening` prop → `ListeningDots`), never a stop square: `trailingIcon="mic" listening={listeningField === "note"}`.
- **App icon** (`frontend/assets`): a gold coin split in two on the violet gradient. Sources `brand-mark.svg` / `brand-mark-foreground.svg`; exports: `icon.png` (iOS light + default), `icon-dark.png` / `icon-tinted.png` (iOS 18 appearances), `adaptive-icon.png` + `adaptive-background.png` + `adaptive-monochrome.png` (Android adaptive + themed icons), `splash-icon.png`, `favicon.png`. Launcher icons only change after a native rebuild (dev build / APK), not a Metro reload.
- **Sheets and dates**: every bottom sheet uses `components/ui/BottomSheet` (spring in over a fading scrim, drag the handle/header to dismiss, `expandable` adds a ~92% snap, `onClose` fires only after the close animation, hidden under the app lock). Dates on iOS and Android go through `Input`'s `datePicker` prop, which opens `DatePickerSheet` (no native date dialogs); its maths lives in `lib/calendar.ts` on local-noon dates.
- **UI primitives**: every screen composes `components/ui`. Do not restyle buttons/inputs ad hoc. `Icon` is the only icon adapter (Ionicons names mapped semantically).
- **NativeWind interop**: `babel` uses `jsxImportSource: "nativewind"`. Interactive/animated natives (`Pressable`, `Animated.View` with Reanimated styles, `TextInput`) are created with `React.createElement` and styled with `StyleSheet`, while NativeWind classes live on non-interactive inner views. Follow `Touch.tsx`, `Input.tsx`, `TopTabs.tsx`.
- **Text**: use `components/ui/Text`; font weight comes from the `font-*` class (Manrope 400–800 bundled locally).
- **Feedback**: use `useToast()` (top-right slide-in, stacked, swipe to dismiss) for results, errors, and hints. Do not add pastel "info banner" boxes (`bg-gold-soft`, `bg-mint-soft` panels) — the product owner rejected them. Native `Alert` is reserved for explicit two-choice confirmations.
- **Motion**: transform/opacity only, respect `useReducedMotion`, no looping decoration.
- **Money**: integer minor units, percentages in basis points, totals per currency.
- **Backend**: every route has TypeBox body/params/response schemas; throw `DomainError` subclasses; financial writes require `idempotency-key`. `exactOptionalPropertyTypes` is on — never pass `undefined` to optional SDK fields, spread conditionally.
- **File uploads on native**: Expo replaces global `fetch` with `expo/fetch`, which throws "Unsupported FormDataPart implementation" for React Native `{ uri, name, type }` FormData parts. Native multipart uploads go through `XMLHttpRequest` (`postNativeForm` in `lib/api.ts`); keep `fetch` for web only.
- **Typed routes**: dynamic `router.replace(stringVar)` needs an `Href` cast.
- Expo Go lacks speech recognition and Face ID; OCR/speech/share intake need a dev build (`expo prebuild && expo run:ios`).

## Current workstream (started 2026-09-14)

Product owner request, in order ("features first, Figma design at the very end"):

1. Replace pastel banner boxes and `Alert` feedback with a proper app-wide toast that slides in from the top right with smooth motion.
2. No email confirmation for now: name + email creates the account and signs in; returning users sign in with email.
3. Biometric unlock (face recognition and fingerprint) when enabled from Settings.
4. Redesign the sign-up screen after the Figma community file "Login / SignUp Web & Mobile App Design" (dark indigo space scene, planet illustration top right, oversized uppercase heading, dark translucent inputs, gradient CTA, header link to switch modes), adapted to LenaDena branding.

Status is tracked at the bottom of this file.

## Known issues / follow-ups

- **Apply migrations on the hosted project: `202609140005`, `202609180007_people.sql`, then `202611100010_person_emails.sql`** (the last one switches on emails to people; see "Emails to people" below) (0007 now carries 0006's column and is safe to re-run; run `notify pgrst, 'reload schema';` if the new functions still 404). 0007 also adds `app_invite_person` and `app_finish_notification` (the worker needs it: without it, sent emails can't be marked sent on the hosted project and would repeat). Until 0007 is applied the app keeps working: the plan returns `people: []` and People writes answer 503 `people_unavailable`.
- **People** (2026-09-18): saved people are owner-private (`public.people`, unique per owner by `lower(name)`); individual entries link via `personal_transactions.person_id`. The API finds-or-creates a person from `counterparty` when no `personId` is sent, links older unlinked entries on create, renames history on rename, and unlinks on delete. `PersonAvatar` (fixed name-hash tints, status rings) is separate from the account `Avatar` because saved people aren't accounts. Names used on individual balances but not saved (older rows, or a DB without 0007) appear as history-only people (`peopleWithHistory`, ids `history:<name>` — never send them to the API). Invites: email (`POST /v1/people/:id/invite`, `person_invite` template) and a share-sheet message (`features/people/invite.ts`) with the download link from `EXPO_PUBLIC_APP_DOWNLOAD_URL` / `APP_DOWNLOAD_URL`.
- **Emails to people and sharing** (2026-11-10, migration `202611100010`): every entry and every whole account can be shared as a formatted message through the system share sheet (`features/share/message.ts`, pure and tested; the Share buttons are on entry rows and in the person page's "Send Ali their account" card, `components/people/StatementCard.tsx`). LenaDena can also email a person: the full statement with a PDF on demand, a note when you add an entry, and weekly or monthly reminders, each chosen per person. The rule behind "email when I add an entry": if the person already has something open the API queues the email (after 90 seconds, so entries added together are one email); if they had nothing open it answers `ask` and the app shows the "Email Ali about this?" modal (`EntryEmailPromptHost` at the app root, so the voice flow gets it too). Adding an email to someone who had none sends them the statement. Details, limits and the API are in ARCHITECTURE.md ("Emails to people"). The PDF can't print Arabic/Urdu or emoji (Manrope has no glyphs for them): such text prints as `?`.
- **Branded emails**: Supabase Auth templates live in `supabase/templates/` and are applied with `apply.mjs` (needs a personal access token). Free-plan projects created on/after 2026-06-03 can't edit Auth templates on Supabase's default sender — configure custom SMTP first. Gmail strips `lenadena://` links in notification emails; set `EMAIL_LINK_BASE_URL` to an https host that serves the app routes.
- Why 0005 matters: until it is applied every financial write RPC fails there with `function digest(text, unknown) does not exist` (pgcrypto lives in the `extensions` schema on Supabase). Found 2026-09-14 while testing "Add individual balance".
- `PreferencesProvider` writes theme/email tone straight to `profiles` with the user session and `SupabaseLedgerRepository.updateProfile` reads `profiles` directly; with no table privileges these fail silently on the hosted project (old avatar files are not cleaned up). Move them behind RPCs.
- Web visual QA uses Expo web + headless Chrome driven over CDP; Metro caches inlined `EXPO_PUBLIC_*` values, so switching to demo mode needs `expo start --clear`. To QA without disturbing the owner's Metro, export a separate demo build with its own cache: `TMPDIR=<scratch> EXPO_PUBLIC_SUPABASE_URL= EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY= EXPO_PUBLIC_API_URL=http://127.0.0.1:3199 npx expo export -p web --output-dir <scratch> --clear`, run a demo API with `AUTH_MODE=demo PORT=3199 node --import tsx src/server.ts` (no env file), and emulate `prefers-color-scheme` for dark.
- Supabase sessions are stored in expo-sqlite localStorage (unencrypted app sandbox); consider a SecureStore-backed adapter.
- Render deployment is prepared but not activated; SMTP worker needs a provider.

## Workstream status

- [x] Toast system + replace banners/alerts
- [x] Password accounts: sign-up with email confirmation, sign-in, forgot/reset/change password, Face ID / fingerprint sign-in (2026-11-13; replaces the email-only sign-in; unit tests + web verification against a fake Auth server)
- [ ] Hosted project: apply migration 202611130011, set Confirm email ON + min password 8 + Brevo SMTP, then install the new build (the old build cannot sign in again once the API drops /v1/auth)
- [x] Biometric app lock + Settings controls (unit tested; on-device prompts need a dev build to verify)
- [x] Figma-based auth redesign (+ lock screen styling, desktop split layout, pastel badges/panels neutralized); checked in web screenshots at 402x874, 375x667 and 1440x900
- [x] Docs updated (ARCHITECTURE API table and flows, PROJECT_MEMORY, DESIGN_SYSTEM, README, DEPLOYMENT)
- [x] Independent review of lock/toast/auth logic; its four lock bugs and the credible minor issues are fixed and unit tested
- [ ] Hosted DB: apply migration 202609140005 (owner action)
- [ ] Exercise biometric prompts in a development build on iOS and Android
- [x] 2026-09-18: dark mode (Light/Dark/System) across every screen, unmistakable selection states, keyboard clearance, voice listening dots, split-coin app icon + logo, People (API, migration, screens, picker), branded emails — checked by typecheck/tests and web screenshots in both themes; native look is the owner's review
- [ ] Hosted DB: apply migrations 202609180006, 202609180007 and 202611100010; apply the Supabase email templates (custom SMTP first)

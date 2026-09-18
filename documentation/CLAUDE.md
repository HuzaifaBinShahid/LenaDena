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
- `ALLOW_INSTANT_AUTH=true` (backend, development only) enables email-only account creation and sign-in without email verification. It is hard-disabled when `NODE_ENV=production`. See "Authentication" below.
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
                           Text, Icon, Avatar, GroupAvatar, Badge, Touch, Screen, Switch, Toast)
  components/layout/       PageHeader, AppHeader, SectionHeader, EmptyState
  components/brand/        BrandMark (app-icon tile + wordmark), CoinMark (split gold coin, the logo), SplashTransition,
                           SpaceBackdrop (SVG scene for auth/lock), Clay (3D clay illustrations)
  features/auth/           AuthProvider (session, instant auth, email-link fallback), useAuthForm, goToSignIn
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
  plugins/auth.ts          resolves bearer token -> request.authUser (skips public /v1/auth/* routes)
  plugins/repository.ts    Memory vs Supabase repository
  routes/                  health.ts, auth.ts (public /v1/auth/options + /v1/auth/instant), ledger.ts (all financial routes),
                           people.ts (/v1/people CRUD)
  auth/                    InstantAuthGateway (Supabase Auth admin calls; faked in routes/auth.test.ts)
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

- **Create account**: name + email -> `POST /v1/auth/instant {mode:"signup"}` -> backend `auth.admin.createUser({ email_confirm: true, user_metadata: { name } })` -> `auth.admin.generateLink({ type: "recovery" })` -> returns a one-time `tokenHash` -> client `supabase.auth.verifyOtp({ token_hash, type: "email" })` -> session. The DB trigger creates the profile from `metadata.name`. Duplicate email -> 409 `account_exists`.
- **Sign in**: email -> same route with `mode:"signin"`. A `recovery` link is used on purpose: `magiclink` silently creates accounts for unknown emails, `recovery` answers `user_not_found` (-> 404 `account_not_found`).
- The service role has **no direct table privileges** on the hosted project (all DB access is `app_*` SECURITY DEFINER RPCs). Auth helpers must use only the Auth admin API, never `from("profiles")`.
- **Fallback**: `GET /v1/auth/options` reports `instantAuth`. When it is off (production, flag unset), the auth screen falls back to Supabase email links (`signInWithOtp`).
- Verified end to end on 2026-09-14 against the hosted project (script-driven and through the web UI), using throwaway accounts that were deleted afterwards.
- **Stale sessions**: a 401 from `/v1/me/plan` is confirmed with `supabase.auth.getUser()` before signing the device out locally (`LedgerProvider`), so a deleted account lands on `/auth` but a network hiccup never signs anyone out. The API answers 503 `auth_unavailable` (not 401) when Supabase Auth is unreachable.
- **Security trade-off (accepted "for now" by the product owner, 2026-09-14)**: while instant auth is enabled, anyone who can reach the API and knows an email address can open that account. Cross-site browser calls are blocked (non-loopback `Origin` rejected) and the route is rate-limited, but this must be replaced with passwords, OTP codes, or passkeys before real users.
- **App lock** (`features/security`): optional per-account biometric lock (Face ID / Touch ID / fingerprint / face unlock, device passcode fallback) enabled in Settings, with a lock delay. Preference lives in SecureStore. An identity with the lock on stays locked until it passes a biometric check **in this run** (`verified` set keyed by email; unlock, enabling, and `verifyForSignIn` add to it, sign-out clears it) — this covers restored sessions, sessions that reappear after an offline refresh, and email-only sign-ins. Returning from background after the delay locks again (negative elapsed time locks). The lock is an overlay (navigation state survives; `ScreenObscuredContext` hides native modals; Android back is consumed); a privacy cover hides the iOS app-switcher snapshot. Flows the app opens (`runWithoutLocking()` pickers/share/permission dialogs, biometric prompts) get a bounded 3-minute grace, never a free pass. With no device credential left, `turnOffWithoutCredential()` lets the owner switch it off. The account that enabled it is remembered for the "Or continue with Face ID" sign-in shortcut (only while instant auth is on; email never prefilled). Expo Go on iOS cannot use Face ID (no `NSFaceIDUsageDescription`), so iOS falls back to the passcode there; Face ID works in a development build. On-device prompts have not been exercised yet (no CocoaPods on the dev Mac).

## Conventions that bite

- **The auth screen is frozen (product owner, 2026-09-14: "make sure that the auth screen remain untouchable ... always").** Never change `frontend/src/app/auth.tsx`, `components/brand/SpaceBackdrop.tsx`, or `features/security/LockScreen.tsx` (which shares the look) during other design work. The primitive paths they render — `Button` `gradient` variant, `Input`/`Field` `dark` appearance, `BrandMark` `tone="light"`, `Text`, `Touch`, `Icon` — must keep rendering identically: add new variants or components instead of changing those paths, and re-screenshot `/auth` on the iOS simulator after touching any shared primitive. The one sanctioned change (owner, 2026-09-18: "LD does not look good"): `BrandMark` now draws the split-coin logo (`CoinMark`) instead of the "LD" letters — same tile, sizes and wordmark. The auth screen and lock screen stay dark in both app themes (they use static colours only).
- **Split NativeWind runtime after dependency changes (2026-09-14 incident).** Adding a frontend package (react-native-svg) changed pnpm's peer hash for `react-native-css-interop`/`nativewind` and left the old `node_modules/.pnpm` copies behind. A Metro started without `--clear` resolved app code to the stale copy while the Tailwind stylesheet registered into the new one, so **every className style disappeared on iOS** (black text, collapsed rows, nav bar at the top) while Expo web looked perfect. After ANY frontend dependency change: `pnpm check:nativewind` (also runs as `postinstall --fix`), restart Metro with `pnpm --filter @lenadena/frontend exec expo start --clear`, and verify on the iOS simulator — web screenshots cannot prove native styling. Quick proof of a split: the iOS dev bundle (`/frontend/node_modules/expo-router/entry.bundle?platform=ios&dev=true&minify=false`) contains more than one `react-native-css-interop@0.2.6_<hash>`.
- **Native QA without touching the owner's account**: `xcrun simctl io booted screenshot`, `xcrun simctl openurl booted "exp://127.0.0.1:8081/--/<route>"`, and a throwaway account signed in through the email-link handler (`exp://127.0.0.1:8081/--/#access_token=...&refresh_token=...`). Delete throwaway accounts afterwards.
- **Dark mode (2026-09-18).** Appearance is Light / Dark / System (`usePreferences().theme`, stored locally; `profiles.theme` still stores the legacy names dusk/midnight/system). One switch drives NativeWind (`colorScheme.set`) and, on native, `Appearance`, so keyboards and pickers follow. Tailwind colours are CSS variables (`global.css` `:root` / `.dark:root`, mirrored in `theme/palettes.ts`) — `bg-raised text-ink border-line` switch automatically; `white`, `night`, `lavender`, `lime`, `violet-strong` are constant. In StyleSheets use `makeStyles((c, { isDark }) => …)` or `useTheme().colors`; the static `colors` from `theme/tokens` is only for frozen screens and deliberately constant colours (white on violet, always-dark shells). Dark rules: canvas < raised < surface by lightness, a 1px `line` border on cards/sheets in dark (shadows vanish), never `bg-white` as a surface, brand shells use `shell`/`plum`, scrims use `backdrop`. `usePreferences().palette` is deprecated.
- **Selection states must be unmistakable** (owner: the old white-on-lilac segment was too subtle). The segmented `TopTabs` slides a solid pill (violet, or `tone: "coral" | "mint" | "gold"` per tab — coral for "I owe", mint for "Owed to me"); chips/radios/swatches use a solid fill or a 2px violet ring + check.
- **Keyboard**: forms render inside `Screen`, whose `KeyboardAwareScrollView` (react-native-keyboard-controller, `KeyboardProvider` in `_layout`) keeps the focused field 72pt above the keyboard. Don't add nested ScrollViews/KeyboardAvoidingViews to forms.
- **Voice input** shows three bouncing dots (`Input` `listening` prop → `ListeningDots`), never a stop square: `trailingIcon="mic" listening={listeningField === "note"}`.
- **App icon** (`frontend/assets`): a gold coin split in two on the violet gradient. Sources `brand-mark.svg` / `brand-mark-foreground.svg`; exports: `icon.png` (iOS light + default), `icon-dark.png` / `icon-tinted.png` (iOS 18 appearances), `adaptive-icon.png` + `adaptive-background.png` + `adaptive-monochrome.png` (Android adaptive + themed icons), `splash-icon.png`, `favicon.png`. Launcher icons only change after a native rebuild (dev build / APK), not a Metro reload.
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

- **Apply migrations in order on the hosted project: `202609140005` → `202609180006` → `202609180007_people.sql`** (0007 needs 0006; run `notify pgrst, 'reload schema';` if the new functions still 404). Until 0007 is applied the app keeps working: the plan returns `people: []` and People writes answer 503 `people_unavailable`.
- **People** (2026-09-18): saved people are owner-private (`public.people`, unique per owner by `lower(name)`); individual entries link via `personal_transactions.person_id`. The API finds-or-creates a person from `counterparty` when no `personId` is sent, links older unlinked entries on create, renames history on rename, and unlinks on delete. `PersonAvatar` (fixed name-hash tints, status rings) is separate from the account `Avatar` because saved people aren't accounts.
- **Branded emails**: Supabase Auth templates live in `supabase/templates/` and are applied with `apply.mjs` (needs a personal access token). Free-plan projects created on/after 2026-06-03 can't edit Auth templates on Supabase's default sender — configure custom SMTP first. Gmail strips `lenadena://` links in notification emails; set `EMAIL_LINK_BASE_URL` to an https host that serves the app routes.
- Why 0005 matters: until it is applied every financial write RPC fails there with `function digest(text, unknown) does not exist` (pgcrypto lives in the `extensions` schema on Supabase). Found 2026-09-14 while testing "Add individual balance".
- `PreferencesProvider` writes theme/email tone straight to `profiles` with the user session and `SupabaseLedgerRepository.updateProfile` reads `profiles` directly; with no table privileges these fail silently on the hosted project (old avatar files are not cleaned up). Move them behind RPCs.
- Web visual QA uses Expo web + headless Chrome driven over CDP; Metro caches inlined `EXPO_PUBLIC_*` values, so switching to demo mode needs `expo start --clear`. To QA without disturbing the owner's Metro, export a separate demo build with its own cache: `TMPDIR=<scratch> EXPO_PUBLIC_SUPABASE_URL= EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY= EXPO_PUBLIC_API_URL=http://127.0.0.1:3199 npx expo export -p web --output-dir <scratch> --clear`, run a demo API with `AUTH_MODE=demo PORT=3199 node --import tsx src/server.ts` (no env file), and emulate `prefers-color-scheme` for dark.
- Supabase sessions are stored in expo-sqlite localStorage (unencrypted app sandbox); consider a SecureStore-backed adapter.
- Render deployment is prepared but not activated; SMTP worker needs a provider.

## Workstream status

- [x] Toast system + replace banners/alerts
- [x] Instant account creation and sign-in (backend + client, tests; verified end to end against the hosted project)
- [x] Biometric app lock + Settings controls (unit tested; on-device prompts need a dev build to verify)
- [x] Figma-based auth redesign (+ lock screen styling, desktop split layout, pastel badges/panels neutralized); checked in web screenshots at 402x874, 375x667 and 1440x900
- [x] Docs updated (ARCHITECTURE API table and flows, PROJECT_MEMORY, DESIGN_SYSTEM, README, DEPLOYMENT)
- [x] Independent review of lock/toast/auth logic; its four lock bugs and the credible minor issues are fixed and unit tested
- [ ] Hosted DB: apply migration 202609140005 (owner action)
- [ ] Exercise biometric prompts in a development build on iOS and Android
- [x] 2026-09-18: dark mode (Light/Dark/System) across every screen, unmistakable selection states, keyboard clearance, voice listening dots, split-coin app icon + logo, People (API, migration, screens, picker), branded emails — checked by typecheck/tests and web screenshots in both themes; native look is the owner's review
- [ ] Hosted DB: apply migrations 202609180006 and 202609180007; apply the Supabase email templates (custom SMTP first)

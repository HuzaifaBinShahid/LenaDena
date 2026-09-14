# LenaDena Project Memory

Last updated: 2026-09-14

## Product contract

- LenaDena tracks open balances and records verified settlement history; it does not process or hold funds.
- A user may record a private individual expense or loan without creating a group. Every entry names the person owed or owing, starts open, and can later be marked settled without losing its history.
- An expense requires an event name, event date, amount, payer, participants, and split method.
- Event dates are stored as ISO calendar dates and displayed in explicit day–full month–year order.
- Split methods are equal, exact value, and percentage.
- A payment claim changes a balance after the intended recipient confirms receipt or after an eligible, explicitly labeled payer fallback.
- The payer may settle immediately when the recipient has never opened LenaDena. An active recipient receives a 72-hour review window before payer fallback unlocks.
- Payer fallback records `claimant_fallback`, the confirming user ID, an audit event, and a recipient notification; UI and email must never imply that the recipient confirmed it.
- Proof is optional, private to the two settlement participants, and must not appear in group activity or email.
- Every verified member has a private My plan and may create multiple groups.
- Primary navigation uses My plan, Groups, Reviews, and Activity in a centered floating bottom bar.
- Activity is the combined balance history and filters by date window, personal/group source, specific group, expense/loan/payment type, `Owed to me`/`I owe` balance side, and open/settled status.
- Group expense history shows only the current user's relevant share: `Owed to me` when others owe the user and `I owe` when the user owes the payer. Pending payment claims stay in Reviews until confirmed.
- Reviews is a two-sided Payments view: incoming claims need the recipient's decision, while sent claims show recipient activity status and fallback availability.
- A completed fallback remains visible in Activity as `Payment marked settled by payer`, so both parties can distinguish it from recipient-confirmed history.

## Repository contract

- The product brand is `LenaDena`; the Expo slug and deep-link scheme are `lenadena`, the mobile application identifiers are `com.lenadena.app`, and the canonical mark is the violet `LD` monogram with a mint exchange dot.
- `frontend/` is the Expo React Native client.
- `backend/` is the Fastify API.
- `supabase/` contains database migrations.
- The frontend owns presentation, device integrations, temporary receipt intake, and authentication session storage.
- The backend owns authorization, calculations, ledger transitions, idempotency, and notification outbox writes.
- Supabase owns Auth, account-linked profiles, Postgres, row-level security, and private object storage.
- The service role has no direct table privileges on the hosted project; backend database access goes through `app_*` SECURITY DEFINER functions, and auth helpers use only the Auth admin API.
- The notification worker owns SMTP delivery; transactional functions own outbox creation.

## UI contract

- There is one exported base `Button`, one `Input`, one `Field`, one `TopTabs`, one `Switch`, one `Spinner`, one person `Avatar`, and one `ToastProvider`.
- Feedback (results, errors, hints) uses `useToast()`: stacked toasts slide in from the top right, can be swiped right or tapped away, pause while touched, and announce to screen readers. Pastel status panels (`bg-gold-soft`, `bg-mint-soft` boxes) are rejected by the product owner; explanatory copy is a quiet inline line instead. Native `Alert` is only for two-choice confirmations.
- `Input` and `Field` have a `dark` appearance and `Button` has a `gradient` variant for the space-themed auth and lock screens; `SpaceBackdrop` is the shared illustration there.
- `Badge` and status pills are neutral outlines with a small semantic dot; color never fills the pill.
- All visible copy uses the shared `Text` primitive and locally bundled Manrope weights; text inputs use the same family.
- Feature screens compose primitives and must not copy their interaction or visual states.
- Touch feedback uses short opacity and scale transitions. The splash uses a finite transform-and-opacity sequence; looping loaders, video splashes, and large runtime blur effects are excluded.
- `Touch` renders its `Pressable` through raw React Native creation, Reanimated styles stay on the outer animated view, and optional NativeWind classes render on a non-interactive inner view.
- `Input` renders its `Animated.View` and `TextInput` through raw React Native creation; focus styling runs through a Reanimated shared value and never triggers a React rerender.
- Dusk, Cloud, Midnight, and System preferences alter the dark shell and light working surface without creating a fully dark or fully light product.
- Minimum interactive target is 44 by 44 points.
- Semantic colors always have a text label or icon; color is never the only signal.
- The visual direction is near-black plum, saturated violet, lavender light, translucent borders, and pale working surfaces with separate positive, negative, and warning colors.
- The home gradient extends beneath the status-bar safe area, and the pale workspace overlaps it with a raised rounded edge so the top reads as one continuous composition instead of stacked color bands.
- Top-level tabs are fixed, equal-width bottom-navigation targets; badges are positioned without changing label spacing.
- `Icon` is the only icon adapter and maps semantic names to the rounded Ionicons family. `GroupAvatar` uses a consistent crew glyph when no image is available.
- `Avatar` owns profile-photo rendering and the initials fallback across headers, accounts, members, and payment reviews.
- Cards use 20–24 point radii, a 20-point page gutter, compact rows, and one clear primary action per decision area.
- Expense entry uses three short stages: Details, Split, and Finish. Receipt belongs in Finish and Note is always the final optional field.
- The dashboard Add entry action first presents two clear shared-Button choices: Individual and Group. Individual entry is a single focused form and keeps Note last.

## Backend contract

- Fastify functionality is registered as encapsulated plugins.
- Every route validates request input and declares response schemas.
- Authentication is resolved once in a request hook.
- Group membership and settlement participant checks occur server-side even when RLS also protects the row.
- Money is stored as integer minor units and percentages as integer basis points.
- Personal totals are grouped by currency and must never sum unlike currencies.
- Financial writes accept an idempotency key.
- Individual obligations are private to their owner, require a counterparty, and never contribute to group owe/owed balances. UI copy must describe an open obligation (`I owe` or `Owed to me`), not imply money has already moved (`I paid` or `Paid to me`).
- Confirmed records are corrected with reversal or adjustment events, not silent deletion.
- Database work never runs inside schema validation.
- Receipt, payment-proof, and avatar images pass through authenticated Fastify multipart handling, are limited to 5 MB, and are stored in separate private buckets.
- Account display names and photos may change, but all ledger ownership stays tied to the immutable authenticated profile ID.
- An authenticated plan read updates `last_seen_at`; fallback eligibility is recalculated and enforced by the backend/database, never trusted from the client.
- Invite tokens are random, hashed at rest, expire after seven days, and are single-use.
- Notification claims use an expiring worker lock so parallel workers cannot deliver the same row.

## Runtime modes

- Demo mode uses an in-memory repository with deterministic seed data and the `demo-user` identity.
- Supabase mode activates only when backend credentials exist and `AUTH_MODE=supabase`.
- Instant email sign-in (no inbox verification) is a temporary product decision from 2026-09-14. It requires `ALLOW_INSTANT_AUTH=true`, is hard-disabled when `NODE_ENV=production`, rejects cross-site browser origins, and is rate-limited. Anyone who can reach the API and knows an email can open that account while it is on, so it must be replaced before real users. When it is off the auth screen falls back to Supabase email links.
- Biometric app lock is per account and per device (SecureStore). A lock-enabled account is locked until it passes a biometric check in the current run, including right after an email-only sign-in; sign-out forgets checks. Flows the app opens get a bounded three-minute grace. Face ID requires a development build; Expo Go on iOS falls back to the device passcode.
- Backend development, start, and worker scripts load the ignored `backend/.env` through Node's built-in environment-file support.
- Missing optional native modules degrade to typed or manual entry without blocking the main expense flow.
- Expo Go is detected before the speech-recognition package is loaded, preventing a missing-native-module crash and directing the user to a development build.

## Current delivery state

- The LenaDena rebrand is applied to app metadata, installed icons, splash and in-app wordmarks, API and notification copy, share and invite copy, package scopes, deep links, database invite functions, generated bundles, and documentation.
- Migration `202609130003_rebrand_lenadena.sql` updates deployed invite functions and any pending outbox invite links to the LenaDena scheme.
- Foundation workspace and configuration are present.
- Mobile navigation, design system, core screens, store, API client, share handler, speech adapter, and OCR adapter are implemented.
- Fastify health, plan, profile, group, invite, upload, group expense, individual obligation create/settle, payment claim, recipient review, and payer-fallback routes are implemented.
- Supabase schema, storage buckets, transactional RPCs, notification outbox, and RLS policies are implemented.
- The hosted LenaDena Supabase project is provisioned in Singapore, the first four migrations are applied, and `lenadena://` authentication redirects are configured. Local ignored environment files point the frontend and backend to it.
- Render deployment is prepared but deferred because card verification was declined; local development continues against the hosted Supabase project.
- SMTP worker, tone templates, reminder throttling, retry scheduling, and quiet-mode suppression are implemented.
- Instant account creation and sign-in, the app-wide toast system, biometric app lock with Settings controls and biometric sign-in, and the Figma-based space redesign of the auth and lock screens were added on 2026-09-14. Instant sign-up and sign-in were verified end to end against the hosted project and in the web build.
- Migration `202609140005_pgcrypto_search_path.sql` is written but must be applied to the hosted project: until then every financial write (groups, invites, expenses, individual entries, payment claims and reviews) fails there with `function digest(text, unknown) does not exist`.
- Strict type checks and 51 automated tests pass; backend compilation, Expo configuration, web export, iOS bundle export, and local API/UI smoke checks are part of the verification workflow.
- Expo dependency validation reports all SDK packages current and all 21 Expo Doctor checks pass in the configured local toolchain.

## External production inputs

- SMTP host credentials, a verified sender address, and a worker deployment target must be supplied.
- A backend hosting target still needs to be activated before remote/mobile testing outside the local Fastify server.
- App Store and Play Store identifiers, signing, and privacy disclosures must be finalized.
- OCR and speech locale coverage require a real-device matrix.
- Payment proof retention defaults to 30 days after confirmation but remains a product/legal configuration choice.

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
- The frontend owns presentation, device integrations, temporary receipt intake, and authentication session storage. Voice balance entry records a short clip locally, requests an authenticated transcript, and presents a confirmation-first draft; it never writes a ledger record directly.
- The backend owns authorization, calculations, ledger transitions, idempotency, and notification outbox writes.
- Supabase owns Auth, account-linked profiles, Postgres, row-level security, and private object storage.
- The service role has no direct table privileges on the hosted project; backend database access goes through `app_*` SECURITY DEFINER functions, and auth helpers use only the Auth admin API.
- The notification worker owns SMTP delivery; transactional functions own outbox creation.

## UI contract

- There is one exported base `Button`, one `Input`, one `Field`, one `TopTabs`, one `Switch`, one `Spinner`, one account `Avatar`, and one `ToastProvider`. Saved People (not accounts) use `PersonAvatar` in `components/people` — fixed name-hash tints, any size, balance status rings.
- Feedback (results, errors, hints) uses `useToast()`: stacked toasts slide in from the top right, can be swiped right or tapped away, pause while touched, and announce to screen readers. Pastel status panels (`bg-gold-soft`, `bg-mint-soft` boxes) are rejected by the product owner; explanatory copy is a quiet inline line instead. Native `Alert` is only for two-choice confirmations.
- `Input` and `Field` have a `dark` appearance and `Button` has a `gradient` variant for the space-themed auth and lock screens; `SpaceBackdrop` is the shared illustration there.
- `Badge` and status pills are neutral outlines with a small semantic dot; color never fills the pill.
- All visible copy uses the shared `Text` primitive and locally bundled Manrope weights; text inputs use the same family.
- Feature screens compose primitives and must not copy their interaction or visual states.
- Touch feedback uses short opacity and scale transitions. The splash uses a finite transform-and-opacity sequence; looping loaders, video splashes, and large runtime blur effects are excluded.
- `Touch` renders its `Pressable` through raw React Native creation, Reanimated styles stay on the outer animated view, and optional NativeWind classes render on a non-interactive inner view.
- `Input` renders its `Animated.View` and `TextInput` through raw React Native creation; focus styling runs through a Reanimated shared value and never triggers a React rerender.
- Appearance is Light, Dark, or System (default System). Dark is a full deep night-purple theme (canvas < raised < surface by lightness, hairline borders instead of shadows, brand violet shells kept); the older Dusk/Cloud/Midnight choices map to Light/Light/Dark. The sign-in and lock screens stay always-dark in both.
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
- Voice recordings use the same authenticated multipart boundary but are transient: the server forwards a bounded clip to Deepgram in memory and returns text only. `DEEPGRAM_API_KEY` is a backend-only deployment secret; voice drafts require a user confirmation before the ordinary idempotent personal-transaction write.
- Account display names and photos may change, but all ledger ownership stays tied to the immutable authenticated profile ID.
- An authenticated plan read updates `last_seen_at`; fallback eligibility is recalculated and enforced by the backend/database, never trusted from the client.
- Invite tokens are random, hashed at rest, expire after seven days, and are single-use.
- Notification claims use an expiring worker lock so parallel workers cannot deliver the same row.
- A person can delete their own account in the app (`POST /v1/me/delete`, password re-entered, recent password sign-in required). It deletes their sign-in, identity and private data, and keeps shared group records pointing at an anonymised "Deleted user" so other members' balances stay correct; a group where they were the only member is deleted. The profile row is kept after the sign-in is deleted, so `profiles.id` no longer references `auth.users`.
- Expenses and individual balances can be edited and deleted (2026-11-17, migration `202611170013`). Group expenses move other people's balances, so only whoever added or paid one may edit it (while everyone in it is still in the group), they or the group owner/admin may delete it, and both are written to the group's activity feed with no email. Individual balances are private: once a payment is recorded the amount must stay above it and the direction and currency lock. Deleting removes the receipt photo too. The rules live in the database functions; the app shows edit and delete only when the server's `canEdit` / `canDelete` say so.
- Groups can add people who already have an account, by email (2026-11-17, migration `202611170015`): the invitation shows up inside their app and they accept or decline; the inviter always gets the same answer, so nothing tells who has an account; nobody is added without saying yes. Leaving or removing someone needs them settled (no balance, no payment awaiting review); the owner cannot leave while others remain.
- Push notifications (2026-11-17, migration `202611170016`, Firebase Cloud Messaging): opt-in per phone, Android only for now. "Remind" on a member who really owes you sends one notification (once a day per person and group, 15 a day); if it can't be sent the app offers to share the same words instead. The notification names the sender, group and amount (visible on a lock screen, and the Settings card says so). Tokens are removed on switch-off, sign-out and account deletion; reminder records are deleted after a week; the policy page names Google Firebase Cloud Messaging as a provider, and must keep matching this.
- The API serves two public, script-free pages the stores require: `/privacy` and `/delete-account` (`backend/src/pages/`). Their text must stay true to what the app does (no automatic purge of old records and no self-serve data export exist, so they do not promise any); when behaviour changes, change the text and `POLICY_UPDATED` together. Deletion requests by email are carried out with the `delete-account` admin command.
- LenaDena emails a person only when the owner asks (Send on their page) or has switched on a weekly or monthly reminder for them (off by default). Saving an entry and adding an address send nothing, and no prompt asks. Automatic group-debt reminders are off unless `ENABLE_GROUP_DEBT_REMINDERS=true`. The worker pass can run hosted on the API (`POST /internal/notifications/run`, shared secret, small batches) instead of a long-lived process.

## Runtime modes

- Demo mode uses an in-memory repository with deterministic seed data and the `demo-user` identity.
- Supabase mode activates only when backend credentials exist and `AUTH_MODE=supabase`.
- Accounts sign up and sign in with email and password directly against Supabase Auth (PKCE). The email must be confirmed (Supabase "Confirm email" on; the API also refuses an unconfirmed email with 403 `email_not_confirmed`, because group invites match the profile email). Passwords: at least 8 characters with a letter and a number, at most 72 bytes. Forgot, reset and change password are in the app; the email-only sign-in of 2026-09-14 was removed on 2026-11-13.
- Biometric app lock is per account and per device (SecureStore). A lock-enabled account is locked until it passes a biometric check in the current run; a password sign-in or a biometric sign-in counts as that check, and sign-out forgets checks. Biometric sign-in (separate switch) keeps the account's password behind Face ID / fingerprint in secure storage on that device only. Flows the app opens get a bounded three-minute grace. Face ID requires a development build; Expo Go on iOS falls back to the device passcode.
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
- The hosted LenaDena Supabase project is provisioned in Singapore, every migration through `202611170013` is applied (checked against the catalog on 2026-11-17; `202611170014` to `202611170016` are written, not applied), and `lenadena://` authentication redirects are configured. Local ignored environment files point the frontend and backend to it.
- The API runs on Vercel (`lena-dena-backend.vercel.app`, deployed from `main`); a Render blueprint exists but is unused (card verification was declined).
- SMTP worker, tone templates, reminder throttling, retry scheduling, and quiet-mode suppression are implemented.
- The app-wide toast system, biometric app lock with Settings controls and the Figma-based space redesign of the auth and lock screens were added on 2026-09-14. On 2026-11-13 the email-only sign-in was replaced by password accounts with email confirmation, forgot/reset/change password and Face ID / fingerprint sign-in; the auth screen keeps its design and gains a password field, "Forgot password?" and "Check your email" views.
- Migration `202609140005_pgcrypto_search_path.sql` is applied on the hosted project (Supabase keeps pgcrypto in the `extensions` schema; without it every financial write fails with `function digest(text, unknown) does not exist`).
- Strict type checks and the backend and frontend Vitest suites pass (`pnpm typecheck && pnpm test`); the SQL is additionally checked on an in-memory Postgres with scratch scripts that are not in the suite. Web export and local API/UI smoke checks are part of the verification workflow; the iOS bundle export and native biometric prompts have not been exercised recently.
- Expo dependency validation reports all SDK packages current and all 21 Expo Doctor checks pass in the configured local toolchain.

## External production inputs

- Email goes out through Brevo with a Gmail sender, which Brevo flags: use an address on your own domain with SPF, DKIM and DMARC before launch.
- Supabase Free can pause after a week of inactivity and does not promise backups: plan a paid tier or backups before real users depend on it.
- Release signing (the APKs are debug-signed), an Android app bundle, the Play Store and App Store listings and a demo reviewer account are still to do. The public privacy policy and account deletion pages exist.
- OCR and speech locale coverage require a real-device matrix.
- Payment proof retention defaults to 30 days after confirmation but remains a product/legal configuration choice.

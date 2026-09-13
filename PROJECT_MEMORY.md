# OweYaar Project Memory

Last updated: 2026-09-13

## Product contract

- OweYaar tracks open balances and records verified settlement history; it does not process or hold funds.
- A user may record a private individual expense or loan without creating a group. Every entry names the person owed or owing, starts open, and can later be marked settled without losing its history.
- An expense requires an event name, event date, amount, payer, participants, and split method.
- Event dates are stored as ISO calendar dates and displayed in explicit day–full month–year order.
- Split methods are equal, exact value, and percentage.
- A payment claim changes a balance only after the intended recipient confirms receipt.
- Proof is optional, private to the two settlement participants, and must not appear in group activity or email.
- Every verified member has a private My plan and may create multiple groups.
- Primary navigation uses My plan, Groups, Reviews, and Activity in a centered floating bottom bar.
- Activity is the combined balance history and filters by date window, personal/group source, specific group, expense/loan/payment type, `Owed to me`/`I owe` balance side, and open/settled status.
- Group expense history shows only the current user's relevant share: `Owed to me` when others owe the user and `I owe` when the user owes the payer. Pending payment claims stay in Reviews until confirmed.

## Repository contract

- `frontend/` is the Expo React Native client.
- `backend/` is the Fastify API.
- `supabase/` contains database migrations.
- The frontend owns presentation, device integrations, temporary receipt intake, and authentication session storage.
- The backend owns authorization, calculations, ledger transitions, idempotency, and notification outbox writes.
- Supabase owns Auth, Postgres, row-level security, and private object storage.
- The notification worker owns SMTP delivery; transactional functions own outbox creation.

## UI contract

- There is one exported base `Button`, one `Input`, one `Field`, one `TopTabs`, and one `Spinner`.
- All visible copy uses the shared `Text` primitive and locally bundled Manrope weights; text inputs use the same family.
- Feature screens compose primitives and must not copy their interaction or visual states.
- Touch feedback uses short opacity and scale transitions. The splash uses a finite transform-and-opacity sequence; looping loaders, video splashes, and large runtime blur effects are excluded.
- `Touch` renders its `Pressable` through raw React Native creation, Reanimated styles stay on the outer animated view, and optional NativeWind classes render on a non-interactive inner view.
- `Input` renders its `Animated.View` and `TextInput` through raw React Native creation; focus styling runs through a Reanimated shared value and never triggers a React rerender.
- Dusk, Cloud, Midnight, and System preferences alter the dark shell and light working surface without creating a fully dark or fully light product.
- Minimum interactive target is 44 by 44 points.
- Semantic colors always have a text label or icon; color is never the only signal.
- The visual direction is near-black plum, saturated violet, lavender light, translucent borders, and pale working surfaces with separate positive, negative, and warning colors.
- Top-level tabs are fixed, equal-width bottom-navigation targets; badges are positioned without changing label spacing.
- `Icon` is the only icon adapter and maps semantic names to the rounded Ionicons family. `GroupAvatar` uses a consistent crew glyph when no image is available.
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
- Uploaded images pass through authenticated Fastify multipart handling, are limited to 5 MB, and are stored in private buckets.
- Invite tokens are random, hashed at rest, expire after seven days, and are single-use.
- Notification claims use an expiring worker lock so parallel workers cannot deliver the same row.

## Runtime modes

- Demo mode uses an in-memory repository with deterministic seed data and the `demo-user` identity.
- Supabase mode activates only when backend credentials exist and `AUTH_MODE=supabase`.
- Missing optional native modules degrade to typed or manual entry without blocking the main expense flow.
- Expo Go is detected before the speech-recognition package is loaded, preventing a missing-native-module crash and directing the user to a development build.

## Current delivery state

- Foundation workspace and configuration are present.
- Mobile navigation, design system, core screens, store, API client, share handler, speech adapter, and OCR adapter are implemented.
- Fastify health, plan, group, invite, upload, group expense, individual obligation create/settle, payment claim, and review routes are implemented.
- Supabase schema, storage buckets, transactional RPCs, notification outbox, and RLS policies are implemented.
- SMTP worker, tone templates, reminder throttling, retry scheduling, and quiet-mode suppression are implemented.
- Strict type checks and 22 automated tests pass; backend compilation, Expo configuration, web export, iOS bundle export, and local API/UI smoke checks are part of the verification workflow.
- Expo dependency validation reports all SDK packages current and all 21 Expo Doctor checks pass in the configured local toolchain.

## External production inputs

- Supabase project URL, publishable key, and secret key must be supplied.
- SMTP host credentials, a verified sender address, and a worker deployment target must be supplied.
- App Store and Play Store identifiers, signing, and privacy disclosures must be finalized.
- OCR and speech locale coverage require a real-device matrix.
- Payment proof retention defaults to 30 days after confirmation but remains a product/legal configuration choice.

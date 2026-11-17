# LenaDena Architecture

## System shape

```text
Expo React Native client
  ├─ Expo Router screens
  ├─ NativeWind design system
  ├─ Supabase session (email + password, email confirmation, biometric sign-in)
  ├─ biometric app lock and app-wide toasts
  ├─ on-device OCR and field dictation
  ├─ reviewed voice-entry recording client
  └─ WhatsApp/native share intake
            │ HTTPS + bearer token
            ▼
Fastify API
  ├─ request schemas and response schemas
  ├─ authentication and authorization hooks
  ├─ integer-money validation
  ├─ idempotent ledger commands
  ├─ server-only Deepgram transcription boundary
  └─ private multipart upload boundary
            │ service-role RPC and Storage
            ▼
Supabase
  ├─ Auth
  ├─ PostgreSQL ledger and RLS
  ├─ private receipts, payment proofs, and profile photos
  └─ notification outbox
            │ locked batches
            ▼
Node SMTP worker
```

The client never receives the Supabase secret key. Supabase Auth creates the session, but Fastify is the only financial write boundary. SQL functions perform multi-row financial changes atomically.

## Repository boundaries

```text
frontend/
  src/app/                 route screens and native intent handling
  src/components/ui/       the single reusable primitives
  src/features/            auth, security (app lock), capture, ledger, preferences, home views
  src/lib/                 API, formatting, Supabase client
backend/
  src/routes/              transport contracts (financial routes; the API has no sign-in routes)
  src/plugins/             auth and repository composition
  src/domain/              money rules and shared domain types
  src/repositories/        in-memory and Supabase adapters
  src/notifications/       email templates and worker configuration
  src/worker.ts            outbox processor
supabase/migrations/       schema, RLS, storage, and transactional RPCs
```

## Reusable UI rule

There is one exported `Button`, `Input`, `Field`, `TopTabs`, `Switch`, `Spinner`, and `Toast` provider. Every screen composes these primitives. Result, error, and hint feedback goes through `useToast()`; native `Alert` is reserved for two-choice confirmations. `Touch` is the internal interaction engine used by the primitives and tappable cards; it centralizes reduced-motion-aware opacity, scale timing, and optional haptics. `Icon` is the single semantic adapter over Ionicons, while `GroupAvatar` and `SectionHeader` keep list identity and section hierarchy consistent.

Interaction targets are at least 44 points. Top-level tabs use four equal 54-point targets so badges and label length cannot collapse spacing. `Avatar` is the single person-photo and initials fallback component used by account, member, and payment views. Animations use opacity and transform only. The splash takes 680 ms and drops to 80 ms when reduced motion is enabled. A single static gradient may be used for hierarchy; runtime blur and looping decoration remain excluded. OCR, uploads, and network mutations expose loading states without blocking navigation rendering.

## Ledger invariants

- Amounts are integer minor units; percentages are integer basis points.
- The personal plan aggregates owe and owed totals separately for each currency.
- Individual expenses and loans remain owner-private and do not alter group balances.
- Transaction history projects group expenses to the current user's owed/owing share. Private individual obligations start open and remain in history after settlement; group payment movement appears after recipient confirmation or an eligible audited payer fallback.
- Expense shares must add up exactly to the expense amount.
- Percentage shares must add up to 10,000 basis points.
- Event name and event date are required.
- Payers and participants must be active group members.
- A debtor may claim no more than the currently open direct balance.
- A pending claim pauses reminders and reserves its amount.
- Only the intended recipient may confirm or flag a payment.
- A payer may self-settle immediately when the recipient has never opened LenaDena, or after 72 hours without review for an active recipient.
- A fallback stores `claimant_fallback`, the confirming account, an activity event, and a recipient notification; it is never represented as recipient confirmation.
- Only confirmed settlements change the ledger.
- Financial commands carry an idempotency key.

## Main request flows

### Expense

1. The Add entry sheet routes the user to an Individual balance or Group expense flow.
2. An individual entry records expense/loan kind, `I owe`/`Owed to me` balance side, counterparty, amount, due date, and an optional note without group membership. It starts open and the owner can later mark it settled.
3. A group entry starts from manual entry or an imported receipt.
4. On-device OCR suggests fields; the user reviews them.
5. The client calculates a preview for equal, exact, or percentage division.
6. A receipt is uploaded privately when attached.
7. Fastify validates membership and the split contract.
8. PostgreSQL inserts the expense, shares, activity event, idempotency result, and email outbox rows in one transaction.

### Editing and deleting (2026-11-17)

Migration `202611170013_edit_delete_entries.sql` adds the rules; the API (`GET|PATCH|DELETE /v1/expenses/:id`, `PATCH|DELETE /v1/personal-transactions/:id`) and the app only carry them.

- **Group expense, edit:** only the person who added or paid it, and only while everyone in it is still in the group (`participant_left` otherwise: delete and re-add). It replaces the name, date, note, amount, split method and shares; the group and the payer never change. It sets `expenses.updated_at` (shown as "Edited"), writes an `expense_updated` event to the group's activity ("Sara edited this expense. It is now 1200 PKR") and sends **no email**. A repeated request with the same idempotency key does nothing twice.
- **Group expense, delete:** the same people, or the group's owner or admin. The row and its shares are removed for good (the unused `reversed_at` column stays unused), balances recompute, settlements stay, an `expense_deleted` event keeps only the name and amount, and the receipt photo is removed from storage.
- **Individual balance:** private to its owner, who can change everything, except that once a payment is recorded the amount must stay above what has been paid and who owes whom and the currency are locked (`entry_has_payments`, `amount_below_paid`), and a fully paid balance keeps its amount (`entry_settled`). Deleting removes the recorded payments with it.
- **Receipt photos:** `receiptUri` is three-way on update: absent keeps the photo, `null` removes it, a storage path in the caller's own folder replaces it (anything else is `invalid_receipt_path`). The database function returns the path of a photo that may now be deleted (in its owner's folder and referenced by nothing else), and the API removes it from the `receipts` bucket afterwards, best effort: a failure is logged, never fails the request.
- **Who sees what:** each transaction row carries `canEdit`, `canDelete` and (expenses) `editedAt`; payments are never editable. The app shows edit and delete only when the flags are true, so a database without the migration simply shows neither, and the routes answer 503 `edit_unavailable`.
- **Where in the app:** group expense rows (group screen, Groups tab, Activity) open `/expense/new?expenseId=`; the Edit button on an individual balance (person screen, Activity) opens `/transaction/new?id=`. Both are the add forms in edit mode, with Delete at the end.

### Data export (2026-11-17)

Settings -> Export my data (migration `202611170014_export_data.sql`). `app_export_data` builds one document of the caller's own records: the account, the groups they belong to (with the other members' display names), every expense they paid or share, every payment they sent or received, their private individual balances (with what is paid so far), their saved people, the activity feed of the groups they are in, and the emails LenaDena queued for them or their people. **Never** in it: other people's emails or ids, anything private to someone else, deleted expenses, photos and receipt images (the rows only say whether one exists). The API serves it as `lenadena-export-<date>.json` (the document) or `.csv` (balances, expenses and payments in one table, newest first, with a byte-order mark for Excel; text that starts with `=`, `+`, `-` or `@` gets a leading apostrophe so a spreadsheet cannot run something another group member typed as a formula). It is not cached, limited to 5 requests a minute and to about 4 MB. The app writes the file to its cache with `expo-file-system` and opens the share sheet (a browser download on web); earlier exports are removed from the cache first. Migration 0016 adds `notificationDevices` (platform and date of each phone registered for notifications; never a token).

### Group management (2026-11-17)

Migration `202611170015_group_members.sql`; a database without it answers 503 `groups_unavailable` and the new buttons stay hidden.

1. **Add someone by email.** Any member can (as with link invites): `POST /v1/groups/:id/invitations` -> `app_invite_member`. The answer is the same invitation link whether or not the address has an account, so nothing tells the inviter who uses LenaDena; an email is queued either way. One invitation per address per 12 hours (409 `already_invited`), 30 a day per person (429 `invite_limit_reached`), and an address that is already a member is refused (409).
2. **Accept or decline in the app.** An account whose profile email matches sees the invitation inside the app (`GET /v1/me/invitations`: group, who invited them, expiry; never the link's secret) as a banner on the home screen and on `/invitations`, and answers it (`POST /v1/me/invitations/:id/accept` or `/decline`). Nobody is added without saying yes. Only the addressed account can answer; accepting twice is harmless; the group's activity records `member_joined`.
3. **Members screen** (`/group/members?groupId=`, "Manage members" on the group page): roles, what each member owes you (`owesYouMinor`, from `private.pair_balance`: positive when they owe the caller in this group, negative the other way), invitations still waiting, rename (owner or admin), leave, remove.
4. **Leaving and removing** are refused while money is open: the person must be settled (`private.member_is_settled`: balance 0 and no payment awaiting review; 409 `not_settled`). The owner cannot leave while others remain (409 `owner_cannot_leave`); the owner removes anyone but themselves, an admin removes ordinary members, nobody removes the owner. The activity feed records it, and past expenses stay on the books.

### Push notifications and reminders (2026-11-17)

Migration `202611170016_push_notifications.sql` plus Firebase Cloud Messaging (free). Setup is in DEPLOYMENT.md, "Push notifications".

1. **Opt-in on the phone.** Settings -> Notifications -> "Reminders from friends" (Android builds made with a Firebase `google-services.json`; the card is hidden otherwise). Turning it on asks the phone's permission, gets the FCM device token (`getDevicePushTokenAsync`) and sends it to `POST /v1/me/push-token`. `app_register_push_token` keeps one row per token (it moves to whoever registers it last, so a phone changing hands is safe) and at most 10 phones per person.
2. **Taking it back.** Switching off and signing out (asked before the session ends, 4 seconds at most) call `POST /v1/me/push-token/remove`; deleting the account removes tokens and reminders; a token Firebase reports as gone (`404 UNREGISTERED`) is deleted by the API (`app_drop_push_tokens`).
3. **Remind.** On the Members screen, a member who owes you shows "owes you Rs ..." and a Remind button: `POST /v1/groups/:id/nudges {memberId}` -> `app_create_nudge` checks that both are in the (unarchived) group, that it is not yourself, that they really owe you (`pair_balance > 0`, else 409 `nothing_owed`), one reminder per person per group per 24 hours (429 `nudge_cooldown`) and 15 a day (429 `nudge_limit_reached`). It records the reminder only when the person has a phone registered, and returns the names, amount and tokens. The API sends through FCM and answers `{ status }`: `sent` (at least one phone got it), `no_device` (none registered, or all dead), `failed` (nothing got through: the record is undone so the day is not used up) or `unavailable` (the server has no Firebase credentials: the database is not touched). For anything but `sent` the app opens the share sheet with the same words, so a tap always ends with the reminder reaching them one way or another.
4. **Invitation push.** After an invitation is sent, the API asks `app_get_invitation_push_target` (only for an invitation the caller sent in the last five minutes, to an account that is not in the group and has a phone) and pushes "Sara invited you to Weekend crew". Best effort: it never changes the answer, gives up after 3 seconds, and when pushes are configured an invitation always takes at least 0.8 seconds, so the time it took says little about whether the address has an account.
5. **FCM from the API.** `backend/src/push/fcm.ts`: HTTP v1 (`messages:send`) with a service-account JWT (RS256, `node:crypto`) exchanged at Google's token endpoint, the access token cached until five minutes before it ends. No Firebase SDK. `FIREBASE_SERVICE_ACCOUNT_JSON` (the key file's JSON, or that JSON in base64) turns it on; a value that is not a usable key leaves pushes off and logs a warning in production instead of stopping the API.
6. **A tap** carries `{ type, groupId }`; `PushBridge` opens `/group/<id>` or `/invitations` (also when the tap launched the app), after `targetForNotification` has checked the id so data can never steer to another screen.
7. **What is kept.** Tokens until switched off, signed out or deleted; reminder records (sender, recipient, group, time) for a week, only to enforce the limits; no notification text. The export lists `notificationDevices` (platform and date), never a token. A notification shows the amount and group on the lock screen, which the Settings card says.
8. **Not covered.** iOS is not offered (it needs an Apple push key in Firebase and a native FCM token), and nothing is sent to web.

### Voice balance draft

1. The user selects English or Urdu, records a short private-balance command, and stops recording.
2. The authenticated API accepts one bounded multipart audio clip, forwards it in memory to Deepgram with only name hints, and returns text; it cannot write the ledger.
3. The app parses a conservative draft and shows transcript, direction, person, amount, purpose, and date for review.
4. An incomplete or uncertain draft can only open the ordinary form. A complete draft still requires the user to tap Save, which calls the standard idempotent personal-transaction command.

### Settlement

1. A debtor taps `I paid`, chooses the recipient, and may attach proof.
2. Fastify verifies the open direct balance and creates an awaiting-review claim.
3. Reminders for that pair pause.
4. The recipient receives a review email and a short-lived signed proof URL inside the app only.
5. `Money received` posts the confirmed ledger event. `Needs attention` reopens the amount and keeps wording neutral.
6. The payer tracks the claim under Payments. Fallback settlement is immediate for a recipient with no recorded app visit and unlocks after 72 hours for an active recipient who does not review it.
7. Fallback settlement changes the balance, remains explicitly attributed to the payer in the Activity transaction and audit event, and notifies the recipient.

### Account and profile

1. Sign-up: name, email and password go straight to Supabase Auth (`signUp`, PKCE). With "Confirm email" on there is no session until the emailed link is opened; the screen shows "Check your email" and can resend. The auth trigger creates the profile from the name (cleaned and capped, with fallbacks).
2. Sign-in: `signInWithPassword`. An unconfirmed email shows the same "Check your email" view; wrong email or password gets one message. Accounts that existed before passwords (email-only) have none and use "Forgot password".
3. Forgot password: `resetPasswordForEmail` always answers the same, whether or not the address has an account. The link opens `/reset-password?code=…`; the app exchanges the code (only the phone that asked can), enters recovery mode and asks for a new password twice. Signed-in people change it under Settings → Sign-in, which asks for the current password first.
4. Biometric sign-in: after a password sign-in the app offers to keep the password behind Face ID / fingerprint (secure storage, this device only); the auth screen then shows "Face ID · Name". A changed biometric set or a password changed elsewhere removes it and the person signs in with the password once.
5. Fastify verifies the bearer token with Supabase, refuses an account whose email is not confirmed (403 `email_not_confirmed`), and resolves it to the immutable profile ID used by every owned record. A 401 from the plan read signs the device out locally, so a deleted or revoked account returns to sign-in.
6. The Account screen updates the display name and may upload a square image to the private `avatars` bucket.
7. Plan responses receive short-lived signed avatar URLs; changing identity presentation never rewrites financial ownership or history.
8. Opening the authenticated plan updates `last_seen_at`, which is used only to choose the fallback review window.
9. **Deleting an account** (Settings → Delete account, `/delete-account`): the app asks for the password and the word DELETE, signs in again with that password, then calls `POST /v1/me/delete`. The API checks the token's `amr` claim for a password sign-in in the last 10 minutes (the claim survives token refreshes, so a stolen unlocked phone with an old session cannot do it; demo mode has no sign-in to check). `SupabaseLedgerRepository.deleteAccount` then runs four steps in an order that stays retryable: (a) `app_account_storage_paths` lists the person's own files (profile photo, saved people's photos, receipts on individual balances; group receipts and payment proofs stay with the group record), (b) those files are removed from storage and any failure stops here with nothing else changed, (c) `app_delete_account` does the data in one transaction, (d) the Supabase Auth user is deleted last. Migration `202611160012` drops the `profiles.id -> auth.users` cascade, because expenses, shares, settlements and activity reference profiles without cascade (deleting the sign-in would fail for anyone who used a group, or erase other people's records), and adds `profiles.deleted_at`. **Deleted:** sign-in, profile name/email/photo, individual balances, saved people, their receipts and photos, idempotency keys, queued emails to or about them, unaccepted invites. **Kept without their identity:** group expenses, shares, settlements and activity, pointing at a profile renamed "Deleted user" with a placeholder email; their name is replaced in the groups' activity text; a group they owned with others passes to the member who joined first; a group they were the only member of is deleted whole. Idempotent: a repeat finds nothing to do and still closes the sign-in. The public page `/delete-account` describes all of this for the stores and offers deletion by email to people who cannot open the app; the operator carries those out with `pnpm --filter @lenadena/backend delete-account -- <email> [--yes]` (a dry run without `--yes`), which calls the same `deleteAccount` code (DEPLOYMENT.md, "Deletion requests by email"). Change the page text, the SQL and the repository together.

### App lock

1. Settings turns on unlock with Face ID, Touch ID, fingerprint, or face unlock after a successful device check; turning it off needs a check too. The per-account preference and lock delay (immediately, 1 minute, 5 minutes) live in SecureStore.
2. An account with the lock on stays locked until it passes a biometric check in the current run: a session restored at launch and one that reappears after an offline token refresh both meet the lock. Unlocking, turning the lock on, a password sign-in and a biometric sign-in record the check; signing out forgets every check. Returning from the background after the delay locks again, and a clock moved backwards counts as time away.
3. The lock is an overlay above the navigation stack, so screens and half-filled forms survive locking. Native modals hide while it shows, the Android back button is consumed, and a privacy cover hides balances from the iOS app switcher.
4. Leaving through something LenaDena opened (photo picker, share sheet, permission dialog, the passcode screen of a biometric prompt) gets a three-minute grace period instead of an immediate lock; staying away longer still locks.
5. If the phone's passcode and biometrics are removed, no check can pass, so the lock screen and Settings offer to turn the lock off (removing a passcode already requires the owner).
6. Biometric sign-in is a separate switch from the lock: the account that turned it on is remembered on the device (label only) and offered as a shortcut on the auth screen; its email is never prefilled and its password is released only after a biometric check.
7. Expo Go on iOS has no `NSFaceIDUsageDescription`, so iOS asks for the passcode there; Face ID needs a development build.

### Invite

1. A group member creates a seven-day invitation.
2. The raw token appears only in the link and email payload; the database stores its SHA-256 hash.
3. An email-bound invitation can only be accepted by that authenticated address.
4. Acceptance locks the invite row and records one membership and activity event.

## API surface

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness and version |
| GET | `/privacy` | Public privacy policy (HTML, no sign-in, no script). Built from `backend/src/pages/`; contact from `SUPPORT_EMAIL` / `OPERATOR_NAME` |
| GET | `/delete-account` | Public page for the stores: how to delete an account in the app or by email, and what is deleted or kept |
| GET | `/v1/me/plan` | Private member dashboard |
| PATCH | `/v1/me/profile` | Update display name and optional profile photo |
| GET | `/v1/me/export` | Download the person's own records as a file: `?format=json` (everything) or `?format=csv` (balances, expenses and payments); 5 per minute; 503 `export_unavailable` until migration 0014 is applied |
| POST | `/v1/me/delete` | Permanently delete the account. Body `{ "confirm": "DELETE" }`; needs a password sign-in from the last 10 minutes (403 `recent_sign_in_required`); 204 |
| GET | `/v1/groups/:id` | Authorized group summary |
| POST | `/v1/groups` | Create a group and email invites |
| POST | `/v1/groups/:id/invites` | Generate an optional email-bound invite |
| POST | `/v1/groups/:id/invitations` | Invite an email address (members; same answer whether or not it has an account; 20 an hour, 30 a day; 409 `already_invited`, `conflict` for a member). When pushes are on, also notifies an account with a phone, best effort |
| GET | `/v1/me/invitations` | Open invitations addressed to the caller's own email (group, who invited, expiry; no secret) |
| POST | `/v1/me/invitations/:id/accept` | Join the group (the addressed account only); returns the group |
| POST | `/v1/me/invitations/:id/decline` | Decline it; 204 |
| GET | `/v1/groups/:id/members` | Members with roles, `settled`, `owesYouMinor`, the open invitations and `canManage`; 404 for a non-member |
| DELETE | `/v1/groups/:id/members/:memberId` | Remove a member (owner anyone but themselves; admin ordinary members); 409 `not_settled` / `cannot_remove_owner`; 204 |
| POST | `/v1/groups/:id/leave` | Leave; 409 `not_settled` / `owner_cannot_leave`; 204 |
| PATCH | `/v1/groups/:id` | Rename (owner or admin); 204 |
| POST | `/v1/me/push-token` | Register this phone `{ token, platform }`; 204; 503 `push_unavailable` when the server has no Firebase credentials or the database lacks migration 0016 |
| POST | `/v1/me/push-token/remove` | Forget one of the caller's own tokens `{ token }`; 204; works without Firebase credentials so sign-out can always clean up |
| POST | `/v1/groups/:id/nudges` | Remind a member who owes the caller `{ memberId }`; 200 `{ status: sent / no_device / failed / unavailable }`; 409 `nothing_owed`, 429 `nudge_cooldown` (24 h per person and group) / `nudge_limit_reached` (15 a day) |
| POST | `/v1/invites/:token/accept` | Accept a single-use invite |
| POST | `/v1/uploads/:kind` | Store a private receipt, proof, or profile image |
| POST | `/v1/voice/transcribe` | Transcribe one authenticated short command via the server-only Deepgram key; returns text only and never writes a ledger record |
| POST | `/v1/expenses` | Create an expense and shares |
| GET | `/v1/expenses/:id` | One expense in full (shares, split, photo link) with `canEdit`, `editBlockedReason` (`not_yours` / `member_left`) and `canDelete` |
| PATCH | `/v1/expenses/:id` | Edit an expense (idempotency key; `receiptUri` absent keeps, `null` removes, a path replaces); 403 not yours, 409 `participant_left`, 503 `edit_unavailable` |
| DELETE | `/v1/expenses/:id` | Delete an expense (whoever added or paid it, or a group owner or admin); 204 |
| POST | `/v1/personal-transactions` | Create a private individual expense or loan; links it to a saved person (`personId`, or find-or-create by `counterparty`, case-insensitive) |
| PATCH | `/v1/personal-transactions/:id` | Edit an individual balance; 409 `entry_has_payments`, `entry_settled` or `amount_below_paid` when payments lock the change |
| DELETE | `/v1/personal-transactions/:id` | Delete an individual balance with its recorded payments; 204 |
| POST | `/v1/personal-transactions/:id/settle` | Mark the owner's private individual obligation as settled |
| POST | `/v1/people` | Save a person (name required; email and photo optional); 409 `person_exists` on a case-insensitive duplicate |
| PATCH | `/v1/people/:id` | Rename (also renames their history rows), change/clear email and photo, or set `emailUpdates` and `reminderFrequency` (`off` / `weekly` / `monthly`). The answer carries `statementQueued: true` when adding an email to someone who had none sent them the full statement |
| DELETE | `/v1/people/:id` | Remove a person; their entries stay in Activity, unlinked |
| POST | `/v1/people/:id/email` | Email a saved person now: `{ kind: "statement" }` (every entry, with a PDF) or `{ kind: "entry", transactionId }`. 202 queued; 400 `person_has_no_email` / `no_entries` / `transaction_required`, 404 `transaction_not_found`, 429 `email_recently_sent` (one statement per person per 5 minutes) / `email_limit_reached` (100 a day per account), 503 `email_unavailable` without migration 202611100010 |
| POST | `/v1/people/:id/invite` | Email the person an invite to LenaDena (202 queued; 400 `person_has_no_email`, 429 `invite_recently_sent` within 12 hours). The download link is `APP_DOWNLOAD_URL`, else the app's link if it is https on Loadly / Google Play / the App Store |
| POST | `/v1/settlements` | Claim an external payment |
| POST | `/v1/settlements/:id/confirm` | Confirm receipt |
| POST | `/v1/settlements/:id/attention` | Flag a payment for private follow-up |
| POST | `/v1/settlements/:id/self-confirm` | Use an eligible audited payer fallback |

## Notification behavior

The database creates outbox rows for invites, new expenses, payment claims, recipient confirmations, payer-fallback settlements, attention states, and due reminders. Reminder generation is throttled to one row per member and group every 72 hours and skips payment pairs under review.

The worker claims rows with `FOR UPDATE SKIP LOCKED`, a worker UUID, and a five-minute stale-lock timeout. SMTP failures are released and delayed for five minutes. Friendly, cheeky, chaos, and quiet templates are supported; quiet suppresses recurring reminders. Emails never contain receipt or proof content.

Every email shares one branded layout (`backend/src/notifications/layout.ts`): logo lockup, heading, short body, a details card with properly formatted money, one button, a fallback link, a safety note and a footer, with a dark palette for clients that support it. The logo is attached inline (CID) unless `EMAIL_LOGO_URL` points at a hosted copy; `EMAIL_LINK_BASE_URL` turns `lenadena://` links into https links for Gmail. `pnpm --filter @lenadena/backend preview:emails` writes every event × tone plus the Supabase auth templates to `backend/.email-preview/`. Supabase Auth emails (sign-in link, confirm signup, invite, recovery, email change, reauthentication) use the templates in `supabase/templates/`, applied with `supabase/templates/apply.mjs` (see DEPLOYMENT.md).

**People.** `public.people` (owner-scoped, unique per owner by `lower(name)`) holds the user's saved people; `personal_transactions.person_id` links individual entries. Creating a person links earlier unlinked entries with the same name; renaming rewrites their `counterparty`; deleting unlinks. `GET /v1/me/plan` returns `people` (signed photo URLs) and `personId` on linked personal rows. Until migration 202609180007 is applied, the plan returns `people: []` and people writes answer 503 `people_unavailable`. Invites queue a `person_invite` outbox row to the person's email (at most once per person, and per inviter and address, every 12 hours); the app can also share a ready-made invite message with the download link (`EXPO_PUBLIC_APP_DOWNLOAD_URL`). The worker marks rows sent or failed through `app_finish_notification`, because the service role cannot update the outbox table directly on the hosted project.

**Emails to people** (migration `202611100010_person_emails.sql`). LenaDena emails a person only when the owner asks it to: the owner taps **Send** on a person's page for the complete statement with a PDF (`POST /v1/people/:id/email`, `{ kind: "statement" }`, the only kind), or has switched on a weekly or monthly reminder for that person (`reminder_frequency`, `off` by default). Saving an entry sends nothing and no question is asked, and adding or changing a person's address sends nothing (changed 2026-11-14; the database functions `app_notify_new_entry` and the entry kind of `app_queue_person_email` remain but nothing calls them, and `email_updates` is kept but unused). Everything is a `notification_outbox` row for an email-only recipient (`person_statement`, `person_reminder`) whose payload is a snapshot taken by `private.person_snapshot` (entries, per-currency totals, owner name and address); the worker renders the email and, for a statement, the PDF (`notifications/statement-pdf.ts`, pdfkit with the bundled Manrope fonts) from that snapshot alone, and sets the owner as Reply-To. `app_enqueue_person_reminders` queues a reminder per person whose period has passed, only when something is open, the clock restarting each time. The older automatic group-debt reminders (`app_enqueue_due_reminders`, every 72 hours to each member who still owes) are off unless `ENABLE_GROUP_DEBT_REMINDERS=true`, because nobody chose to send them. Limits: a statement per person per 5 minutes, 100 person emails per account per day. Without the migration the app keeps working and the email endpoint answers 503 `email_unavailable`. Sharing a message to WhatsApp, email or any app is client-only (`features/share/message.ts`, the system share sheet).

**Running the email worker** (`notifications/runner.ts`). One pass claims queued rows under a lock (so overlapping passes never send twice), renders and sends them over SMTP, and marks each sent or failed (retried in five minutes). It runs in two ways: the long-lived loop `pnpm worker` (`worker.ts`) on a machine that stays on, or hosted: `POST /internal/notifications/run` on the Vercel API, called every minute by Supabase's `pg_cron` + `pg_net`. The hosted route lives outside `/v1`, exists only when `NOTIFICATIONS_CRON_SECRET` (32+ characters) is set, accepts only `Authorization: Bearer <that secret>` (compared in constant time, 10 calls a minute), and sends at most 3 emails per call (serverless time limit). Setup: DEPLOYMENT.md, "Hosted email worker".

## Production checklist

- Apply the migrations to a fresh Supabase project and inspect the Security Advisor. `202609140005_pgcrypto_search_path.sql` is required on Supabase, where pgcrypto lives in the `extensions` schema. `202609180007_people.sql` requires `202609180006` first.
- In Supabase Authentication: Confirm email ON, minimum password length 8, custom SMTP, redirect URL `lenadena://**`. Apply `202611130011_robust_signup_profile.sql`.
- Test Face ID, Touch ID, and Android biometric unlock in development builds on physical devices.
- Configure redirect URLs for `lenadena://` and the invite deep-link path.
- Set frontend publishable values and backend secret values separately.
- Configure a verified SMTP sender and run one or more worker instances.
- Replace demo app identifiers before store submission.
- Generate iOS and Android development builds and test WhatsApp sharing.
- Test installed on-device speech models for the supported locale matrix.
- Confirm proof retention and account-deletion policies with legal/privacy requirements.
- Add monitoring for API error rate, outbox age, worker failures, and storage growth.

## Implementation references

- [Expo Skills for AI agents](https://docs.expo.dev/skills/)
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [Expo inbound sharing](https://docs.expo.dev/versions/latest/sdk/sharing/)
- [Fastify reference](https://fastify.dev/docs/latest/Reference/)
- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [NativeWind installation](https://www.nativewind.dev/docs/getting-started/installation)
- [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

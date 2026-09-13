# LenaDena Architecture

## System shape

```text
Expo React Native client
  ├─ Expo Router screens
  ├─ NativeWind design system
  ├─ Supabase passwordless session
  ├─ on-device OCR and speech
  └─ WhatsApp/native share intake
            │ HTTPS + bearer token
            ▼
Fastify API
  ├─ request schemas and response schemas
  ├─ authentication and authorization hooks
  ├─ integer-money validation
  ├─ idempotent ledger commands
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
  src/features/            auth, capture, ledger, preferences, home views
  src/lib/                 API, formatting, Supabase client
backend/
  src/routes/              transport contracts
  src/plugins/             auth and repository composition
  src/domain/              money rules and shared domain types
  src/repositories/        in-memory and Supabase adapters
  src/notifications/       email templates and worker configuration
  src/worker.ts            outbox processor
supabase/migrations/       schema, RLS, storage, and transactional RPCs
```

## Reusable UI rule

There is one exported `Button`, `Input`, `Field`, `TopTabs`, and `Spinner`. Every screen composes these primitives. `Touch` is the internal interaction engine used by the primitives and tappable cards; it centralizes reduced-motion-aware opacity, scale timing, and optional haptics. `Icon` is the single semantic adapter over Ionicons, while `GroupAvatar` and `SectionHeader` keep list identity and section hierarchy consistent.

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

### Settlement

1. A debtor taps `I paid`, chooses the recipient, and may attach proof.
2. Fastify verifies the open direct balance and creates an awaiting-review claim.
3. Reminders for that pair pause.
4. The recipient receives a review email and a short-lived signed proof URL inside the app only.
5. `Money received` posts the confirmed ledger event. `Needs attention` reopens the amount and keeps wording neutral.
6. The payer tracks the claim under Payments. Fallback settlement is immediate for a recipient with no recorded app visit and unlocks after 72 hours for an active recipient who does not review it.
7. Fallback settlement changes the balance, remains explicitly attributed to the payer in the Activity transaction and audit event, and notifies the recipient.

### Account and profile

1. Supabase passwordless authentication verifies the email and creates one profile through the auth trigger.
2. Fastify resolves the bearer token to the immutable profile ID used by every owned record.
3. The Account screen updates the display name and may upload a square image to the private `avatars` bucket.
4. Plan responses receive short-lived signed avatar URLs; changing identity presentation never rewrites financial ownership or history.
5. Opening the authenticated plan updates `last_seen_at`, which is used only to choose the fallback review window.

### Invite

1. A group member creates a seven-day invitation.
2. The raw token appears only in the link and email payload; the database stores its SHA-256 hash.
3. An email-bound invitation can only be accepted by that authenticated address.
4. Acceptance locks the invite row and records one membership and activity event.

## API surface

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness and version |
| GET | `/v1/me/plan` | Private member dashboard |
| PATCH | `/v1/me/profile` | Update display name and optional profile photo |
| GET | `/v1/groups/:id` | Authorized group summary |
| POST | `/v1/groups` | Create a group and email invites |
| POST | `/v1/groups/:id/invites` | Generate an optional email-bound invite |
| POST | `/v1/invites/:token/accept` | Accept a single-use invite |
| POST | `/v1/uploads/:kind` | Store a private receipt, proof, or profile image |
| POST | `/v1/expenses` | Create an expense and shares |
| POST | `/v1/personal-transactions` | Create a private individual expense or loan |
| POST | `/v1/personal-transactions/:id/settle` | Mark the owner's private individual obligation as settled |
| POST | `/v1/settlements` | Claim an external payment |
| POST | `/v1/settlements/:id/confirm` | Confirm receipt |
| POST | `/v1/settlements/:id/attention` | Flag a payment for private follow-up |
| POST | `/v1/settlements/:id/self-confirm` | Use an eligible audited payer fallback |

## Notification behavior

The database creates outbox rows for invites, new expenses, payment claims, recipient confirmations, payer-fallback settlements, attention states, and due reminders. Reminder generation is throttled to one row per member and group every 72 hours and skips payment pairs under review.

The worker claims rows with `FOR UPDATE SKIP LOCKED`, a worker UUID, and a five-minute stale-lock timeout. SMTP failures are released and delayed for five minutes. Friendly, cheeky, chaos, and quiet templates are supported; quiet suppresses recurring reminders. Emails never contain receipt or proof content.

## Production checklist

- Apply the migration to a fresh Supabase project and inspect the Security Advisor.
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

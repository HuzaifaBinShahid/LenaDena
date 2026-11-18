import type { ExportDocument } from "../domain/export.js";
import type { GroupPeople, Invitation } from "../domain/groups.js";
import type { DatabaseHealth, InvitationPushTarget, NudgeDelivery, PaymentPushEvent, PaymentPushTarget, PushPlatform } from "../domain/push.js";
import type { CreatedPersonalTransaction, CreateExpenseInput, CreateGroupInput, CreatePersonalTransactionInput, CreatePersonInput, CreateSettlementInput, ExpenseDetail, Group, InviteLink, Member, Person, PersonUpdate, Plan, SettlementStatus, UpdateExpenseInput, UpdatePersonalTransactionInput, UpdatePersonInput, UpdateProfileInput, UploadKind } from "../domain/types.js";

export interface LedgerRepository {
  getPlan(userId: string): Promise<Plan>;
  updateProfile(userId: string, input: UpdateProfileInput): Promise<Member>;
  getGroup(userId: string, groupId: string): Promise<Group>;
  createGroup(userId: string, input: CreateGroupInput, idempotencyKey: string): Promise<Group>;
  createExpense(userId: string, input: CreateExpenseInput, idempotencyKey: string): Promise<{ id: string }>;
  /** Saving an entry never sends an email: the owner emails a statement by hand. */
  createPersonalTransaction(userId: string, input: CreatePersonalTransactionInput, idempotencyKey: string): Promise<CreatedPersonalTransaction>;
  /** One expense in full, with what the caller may do to it. */
  getExpense(userId: string, expenseId: string): Promise<ExpenseDetail>;
  /** Replaces an expense's details and split. Only whoever added or paid it, while everyone in it is still in the group. */
  updateExpense(userId: string, expenseId: string, input: UpdateExpenseInput, idempotencyKey: string): Promise<{ id: string }>;
  /** Whoever added or paid it, or a group owner or admin. Removes it for good, with its receipt photo. */
  deleteExpense(userId: string, expenseId: string): Promise<void>;
  /** Changes an individual balance. Once payments are recorded the amount must stay above them and the direction and currency are locked. */
  updatePersonalTransaction(userId: string, transactionId: string, input: UpdatePersonalTransactionInput): Promise<{ id: string }>;
  /** Removes an individual balance, its recorded payments and its receipt photo. */
  deletePersonalTransaction(userId: string, transactionId: string): Promise<void>;
  /** Invites an email address to a group. The same answer whether or not it has an account; an account also sees it in the app. */
  inviteMember(userId: string, groupId: string, email: string): Promise<InviteLink>;
  /** Open invitations addressed to the caller's own email. */
  listInvitations(userId: string): Promise<Invitation[]>;
  acceptInvitation(userId: string, invitationId: string): Promise<Group>;
  declineInvitation(userId: string, invitationId: string): Promise<void>;
  /** Members with their roles (and whether each is settled), and the open invitations. */
  getGroupPeople(userId: string, groupId: string): Promise<GroupPeople>;
  /** Not while the person owes, is owed or has a payment waiting for review; the owner stays while others remain. */
  leaveGroup(userId: string, groupId: string): Promise<void>;
  /** Owner (anyone) or admin (ordinary members), with the same settling rule. */
  removeMember(userId: string, groupId: string, memberId: string): Promise<void>;
  renameGroup(userId: string, groupId: string, name: string): Promise<void>;
  /** Stores this phone's push token for the person (Settings -> Reminders from friends). The same token moves to whoever registers it last. */
  registerPushToken(userId: string, token: string, platform: PushPlatform): Promise<void>;
  /** Forgets one of the person's own tokens (switched off, or signed out). Harmless for an unknown token. */
  removePushToken(userId: string, token: string): Promise<void>;
  /** Forgets tokens Firebase says are gone. */
  dropPushTokens(tokens: string[]): Promise<void>;
  /**
   * Checks the rules for a reminder (they really owe you, once a day per person and group, 15 a day) and returns what
   * to send. `nudgeId` is null, and nothing is recorded, when the person has no device.
   */
  createNudge(userId: string, groupId: string, memberId: string): Promise<NudgeDelivery>;
  /** Takes a recorded reminder back when it could not be delivered at all, so a failed send does not use up the day. */
  undoNudge(userId: string, nudgeId: string): Promise<void>;
  /** For an invitation the caller just sent: the devices to push, or null (also when there is no account, so it reveals nothing). */
  getInvitationPushTarget(userId: string, groupId: string, email: string): Promise<InvitationPushTarget | null>;
  /**
   * For a payment step the caller just took (`event`): the other person's devices, or null. Null when the step did not
   * just happen, was not the caller's, the other person has no device, a notification for it already went out, or the
   * payer is claiming payments too fast. Never throws for any of those, so it cannot break the payment itself.
   */
  getPaymentPushTarget(userId: string, settlementId: string, event: PaymentPushEvent): Promise<PaymentPushTarget | null>;
  /** Asks the database a trivial question and which migrations it lacks (GET /health/ready). Throws when it cannot answer. */
  checkHealth(timeoutMs: number): Promise<DatabaseHealth>;
  /** Everything that is the person's own, in one document (Settings -> Export my data). Never other people's emails. */
  exportData(userId: string): Promise<ExportDocument>;
  /**
   * Deletes the account: its storage files, its individual data and sign-in, and anonymises what shared groups keep.
   * Safe to retry after a partial failure. The caller must already have checked that the person just signed in.
   */
  deleteAccount(userId: string): Promise<void>;
  settlePersonalTransaction(userId: string, transactionId: string, amountMinor: number | undefined, idempotencyKey: string): Promise<void>;
  settlePersonalTransactions(userId: string, transactionIds: string[], idempotencyKey: string): Promise<void>;
  createPerson(userId: string, input: CreatePersonInput): Promise<Person>;
  /** Adding an email to someone who had none emails them the full statement (when updates are on and entries exist). */
  updatePerson(userId: string, personId: string, input: UpdatePersonInput): Promise<PersonUpdate>;
  deletePerson(userId: string, personId: string): Promise<void>;
  /** Queues the complete statement (with a PDF) or one entry for a saved person right away. */
  emailPerson(userId: string, personId: string): Promise<{ queuedAt: string }>;
  /** Queues an invite email to a saved person; `downloadUrl` is already vetted (or null for none). */
  invitePerson(userId: string, personId: string, downloadUrl: string | null): Promise<{ queuedAt: string }>;
  createSettlement(userId: string, input: CreateSettlementInput, idempotencyKey: string): Promise<{ id: string }>;
  reviewSettlement(userId: string, settlementId: string, decision: Extract<SettlementStatus, "confirmed" | "needs_attention">, note: string | undefined, idempotencyKey: string): Promise<void>;
  selfConfirmSettlement(userId: string, settlementId: string, idempotencyKey: string): Promise<void>;
  storeImage(userId: string, kind: UploadKind, contentType: string, bytes: Buffer): Promise<{ path: string }>;
  createInvite(userId: string, groupId: string, email: string | undefined): Promise<InviteLink>;
  acceptInvite(userId: string, token: string): Promise<Group>;
}

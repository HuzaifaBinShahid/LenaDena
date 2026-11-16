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

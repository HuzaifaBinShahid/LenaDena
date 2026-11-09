import type { CreatedPersonalTransaction, CreateExpenseInput, CreateGroupInput, CreatePersonalTransactionInput, CreatePersonInput, CreateSettlementInput, Group, InviteLink, Member, Person, PersonEmailKind, PersonUpdate, Plan, SettlementStatus, UpdatePersonInput, UpdateProfileInput, UploadKind } from "../domain/types.js";

export interface LedgerRepository {
  getPlan(userId: string): Promise<Plan>;
  updateProfile(userId: string, input: UpdateProfileInput): Promise<Member>;
  getGroup(userId: string, groupId: string): Promise<Group>;
  createGroup(userId: string, input: CreateGroupInput, idempotencyKey: string): Promise<Group>;
  createExpense(userId: string, input: CreateExpenseInput, idempotencyKey: string): Promise<{ id: string }>;
  /** Also decides about email: see EntryEmailDecision. A failing email step never fails the entry. */
  createPersonalTransaction(userId: string, input: CreatePersonalTransactionInput, idempotencyKey: string): Promise<CreatedPersonalTransaction>;
  settlePersonalTransaction(userId: string, transactionId: string, amountMinor: number | undefined, idempotencyKey: string): Promise<void>;
  settlePersonalTransactions(userId: string, transactionIds: string[], idempotencyKey: string): Promise<void>;
  createPerson(userId: string, input: CreatePersonInput): Promise<Person>;
  /** Adding an email to someone who had none emails them the full statement (when updates are on and entries exist). */
  updatePerson(userId: string, personId: string, input: UpdatePersonInput): Promise<PersonUpdate>;
  deletePerson(userId: string, personId: string): Promise<void>;
  /** Queues the complete statement (with a PDF) or one entry for a saved person right away. */
  emailPerson(userId: string, personId: string, kind: PersonEmailKind, transactionId: string | undefined): Promise<{ queuedAt: string }>;
  /** Queues an invite email to a saved person; `downloadUrl` is already vetted (or null for none). */
  invitePerson(userId: string, personId: string, downloadUrl: string | null): Promise<{ queuedAt: string }>;
  createSettlement(userId: string, input: CreateSettlementInput, idempotencyKey: string): Promise<{ id: string }>;
  reviewSettlement(userId: string, settlementId: string, decision: Extract<SettlementStatus, "confirmed" | "needs_attention">, note: string | undefined, idempotencyKey: string): Promise<void>;
  selfConfirmSettlement(userId: string, settlementId: string, idempotencyKey: string): Promise<void>;
  storeImage(userId: string, kind: UploadKind, contentType: string, bytes: Buffer): Promise<{ path: string }>;
  createInvite(userId: string, groupId: string, email: string | undefined): Promise<InviteLink>;
  acceptInvite(userId: string, token: string): Promise<Group>;
}

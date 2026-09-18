import type { CreateExpenseInput, CreateGroupInput, CreatePersonalTransactionInput, CreatePersonInput, CreateSettlementInput, Group, InviteLink, Member, Person, Plan, SettlementStatus, UpdatePersonInput, UpdateProfileInput, UploadKind } from "../domain/types.js";

export interface LedgerRepository {
  getPlan(userId: string): Promise<Plan>;
  updateProfile(userId: string, input: UpdateProfileInput): Promise<Member>;
  getGroup(userId: string, groupId: string): Promise<Group>;
  createGroup(userId: string, input: CreateGroupInput, idempotencyKey: string): Promise<Group>;
  createExpense(userId: string, input: CreateExpenseInput, idempotencyKey: string): Promise<{ id: string }>;
  createPersonalTransaction(userId: string, input: CreatePersonalTransactionInput, idempotencyKey: string): Promise<{ id: string }>;
  settlePersonalTransaction(userId: string, transactionId: string, idempotencyKey: string): Promise<void>;
  createPerson(userId: string, input: CreatePersonInput): Promise<Person>;
  updatePerson(userId: string, personId: string, input: UpdatePersonInput): Promise<Person>;
  deletePerson(userId: string, personId: string): Promise<void>;
  /** Queues an invite email to a saved person; `downloadUrl` is already vetted (or null for none). */
  invitePerson(userId: string, personId: string, downloadUrl: string | null): Promise<{ queuedAt: string }>;
  createSettlement(userId: string, input: CreateSettlementInput, idempotencyKey: string): Promise<{ id: string }>;
  reviewSettlement(userId: string, settlementId: string, decision: Extract<SettlementStatus, "confirmed" | "needs_attention">, note: string | undefined, idempotencyKey: string): Promise<void>;
  selfConfirmSettlement(userId: string, settlementId: string, idempotencyKey: string): Promise<void>;
  storeImage(userId: string, kind: UploadKind, contentType: string, bytes: Buffer): Promise<{ path: string }>;
  createInvite(userId: string, groupId: string, email: string | undefined): Promise<InviteLink>;
  acceptInvite(userId: string, token: string): Promise<Group>;
}

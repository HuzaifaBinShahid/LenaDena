import type { CreateExpenseInput, CreateGroupInput, CreatePersonalTransactionInput, CreateSettlementInput, Group, InviteLink, Plan, SettlementStatus, UploadKind } from "../domain/types.js";

export interface LedgerRepository {
  getPlan(userId: string): Promise<Plan>;
  getGroup(userId: string, groupId: string): Promise<Group>;
  createGroup(userId: string, input: CreateGroupInput, idempotencyKey: string): Promise<Group>;
  createExpense(userId: string, input: CreateExpenseInput, idempotencyKey: string): Promise<{ id: string }>;
  createPersonalTransaction(userId: string, input: CreatePersonalTransactionInput, idempotencyKey: string): Promise<{ id: string }>;
  settlePersonalTransaction(userId: string, transactionId: string, idempotencyKey: string): Promise<void>;
  createSettlement(userId: string, input: CreateSettlementInput, idempotencyKey: string): Promise<{ id: string }>;
  reviewSettlement(userId: string, settlementId: string, decision: Extract<SettlementStatus, "confirmed" | "needs_attention">, note: string | undefined, idempotencyKey: string): Promise<void>;
  storeImage(userId: string, kind: UploadKind, contentType: string, bytes: Buffer): Promise<{ path: string }>;
  createInvite(userId: string, groupId: string, email: string | undefined): Promise<InviteLink>;
  acceptInvite(userId: string, token: string): Promise<Group>;
}

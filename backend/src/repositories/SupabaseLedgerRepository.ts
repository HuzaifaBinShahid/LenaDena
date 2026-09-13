import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DomainError, NotFoundError } from "../domain/errors.js";
import type { CreateExpenseInput, CreateGroupInput, CreatePersonalTransactionInput, CreateSettlementInput, Group, InviteLink, Plan, SettlementStatus, TransactionItem, UploadKind } from "../domain/types.js";
import type { LedgerRepository } from "./LedgerRepository.js";

export class SupabaseLedgerRepository implements LedgerRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getPlan(userId: string): Promise<Plan> {
    const { data, error } = await this.client.rpc("app_get_plan", { p_actor: userId });
    if (error) throw new DomainError(error.message, 500, "database_error");
    if (!data) throw new NotFoundError("Profile not found");
    const { data: transactionData, error: transactionError } = await this.client.rpc("app_get_transactions", { p_actor: userId });
    if (transactionError) throw new DomainError(transactionError.message, 500, "database_error");
    const plan = { ...(data as Omit<Plan, "transactions">), transactions: (transactionData ?? []) as TransactionItem[] };
    await Promise.all(plan.reviews.map(async (review) => {
      if (!review.proofUri) return;
      const { data: signed, error: signedError } = await this.client.storage.from("payment-proofs").createSignedUrl(review.proofUri, 300);
      if (!signedError && signed?.signedUrl) review.proofUri = signed.signedUrl;
    }));
    return plan;
  }

  async getGroup(userId: string, groupId: string): Promise<Group> {
    const plan = await this.getPlan(userId);
    const group = plan.groups.find((item) => item.id === groupId);
    if (!group) throw new NotFoundError("Group not found");
    return group;
  }

  async createGroup(userId: string, input: CreateGroupInput, idempotencyKey: string): Promise<Group> {
    const { data, error } = await this.client.rpc("app_create_group", {
      p_actor: userId,
      p_name: input.name,
      p_currency: input.currency,
      p_accent: input.accent,
      p_invite_emails: input.inviteEmails,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new DomainError(error.message, 400, "database_error");
    return this.getGroup(userId, String(data));
  }

  async createExpense(userId: string, input: CreateExpenseInput, idempotencyKey: string): Promise<{ id: string }> {
    const { data, error } = await this.client.rpc("app_create_expense", {
      p_actor: userId,
      p_payload: input,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new DomainError(error.message, 400, "database_error");
    return { id: String(data) };
  }

  async createPersonalTransaction(userId: string, input: CreatePersonalTransactionInput, idempotencyKey: string): Promise<{ id: string }> {
    const { data, error } = await this.client.rpc("app_create_personal_transaction", {
      p_actor: userId,
      p_payload: input,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new DomainError(error.message, 400, "database_error");
    return { id: String(data) };
  }

  async settlePersonalTransaction(userId: string, transactionId: string, idempotencyKey: string): Promise<void> {
    const { error } = await this.client.rpc("app_settle_personal_transaction", {
      p_actor: userId,
      p_transaction: transactionId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new DomainError(error.message, 400, "database_error");
  }

  async createSettlement(userId: string, input: CreateSettlementInput, idempotencyKey: string): Promise<{ id: string }> {
    const { data, error } = await this.client.rpc("app_claim_settlement", {
      p_actor: userId,
      p_payload: input,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new DomainError(error.message, 400, "database_error");
    return { id: String(data) };
  }

  async reviewSettlement(userId: string, settlementId: string, decision: Extract<SettlementStatus, "confirmed" | "needs_attention">, note: string | undefined, idempotencyKey: string): Promise<void> {
    const { error } = await this.client.rpc("app_review_settlement", {
      p_actor: userId,
      p_settlement: settlementId,
      p_decision: decision,
      p_note: note ?? null,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new DomainError(error.message, 400, "database_error");
  }

  async storeImage(userId: string, kind: UploadKind, contentType: string, bytes: Buffer): Promise<{ path: string }> {
    const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const bucket = kind === "receipt" ? "receipts" : "payment-proofs";
    const path = `${userId}/${randomUUID()}.${extension}`;
    const { error } = await this.client.storage.from(bucket).upload(path, bytes, { contentType, cacheControl: "3600", upsert: false });
    if (error) throw new DomainError(error.message, 500, "upload_error");
    return { path };
  }

  async createInvite(userId: string, groupId: string, email: string | undefined): Promise<InviteLink> {
    const { data, error } = await this.client.rpc("app_create_invite", { p_actor: userId, p_group: groupId, p_email: email ?? null });
    if (error) throw new DomainError(error.message, 400, "database_error");
    return data as InviteLink;
  }

  async acceptInvite(userId: string, token: string): Promise<Group> {
    const { data, error } = await this.client.rpc("app_accept_invite", { p_actor: userId, p_token: token });
    if (error) throw new DomainError(error.message, 400, "database_error");
    return this.getGroup(userId, String(data));
  }
}

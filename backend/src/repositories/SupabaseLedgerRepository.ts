import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ConflictError, DomainError, ForbiddenError, NotFoundError } from "../domain/errors.js";
import type { CreateExpenseInput, CreateGroupInput, CreatePersonalTransactionInput, CreateSettlementInput, Group, InviteLink, Member, Plan, SettlementStatus, TransactionItem, UpdateProfileInput, UploadKind } from "../domain/types.js";
import type { LedgerRepository } from "./LedgerRepository.js";

export class SupabaseLedgerRepository implements LedgerRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getPlan(userId: string): Promise<Plan> {
    const { error: touchError } = await this.client.rpc("app_touch_profile", { p_actor: userId });
    if (touchError) throw new DomainError(touchError.message, 500, "database_error");
    const { data, error } = await this.client.rpc("app_get_plan", { p_actor: userId });
    if (error) throw new DomainError(error.message, 500, "database_error");
    if (!data) throw new NotFoundError("Profile not found");
    const { data: transactionData, error: transactionError } = await this.client.rpc("app_get_transactions", { p_actor: userId });
    if (transactionError) throw new DomainError(transactionError.message, 500, "database_error");
    const basePlan = data as Omit<Plan, "transactions" | "claims"> & { claims?: Plan["claims"] };
    const plan: Plan = { ...basePlan, claims: basePlan.claims ?? [], transactions: (transactionData ?? []) as TransactionItem[] };
    await Promise.all([...plan.reviews, ...plan.claims].map(async (review) => {
      if (!review.proofUri) return;
      const { data: signed, error: signedError } = await this.client.storage.from("payment-proofs").createSignedUrl(review.proofUri, 300);
      if (!signedError && signed?.signedUrl) review.proofUri = signed.signedUrl;
    }));
    const members: Member[] = [plan.user, ...plan.groups.flatMap((group) => group.members), ...plan.reviews.flatMap((review) => [review.debtor, review.recipient]), ...plan.claims.flatMap((claim) => [claim.debtor, claim.recipient])];
    const paths = Array.from(new Set(members.map((member) => member.avatarUrl).filter((value): value is string => Boolean(value))));
    const signedAvatars = new Map<string, string>();
    await Promise.all(paths.map(async (path) => {
      const { data: signed, error: signedError } = await this.client.storage.from("avatars").createSignedUrl(path, 3600);
      if (!signedError && signed?.signedUrl) signedAvatars.set(path, signed.signedUrl);
    }));
    for (const member of members) {
      if (!member.avatarUrl) continue;
      const signedUrl = signedAvatars.get(member.avatarUrl);
      if (signedUrl) member.avatarUrl = signedUrl;
    }
    return plan;
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<Member> {
    const updatesAvatar = Object.hasOwn(input, "avatarPath");
    const { data: existingProfile } = updatesAvatar
      ? await this.client.from("profiles").select("avatar_path").eq("id", userId).maybeSingle()
      : { data: null };
    const { error } = await this.client.rpc("app_update_profile", {
      p_actor: userId,
      p_name: input.name,
      p_avatar_path: input.avatarPath ?? null,
      p_update_avatar: updatesAvatar,
    });
    if (error) throw new DomainError(error.message, 400, "database_error");
    const previousPath = typeof existingProfile?.avatar_path === "string" ? existingProfile.avatar_path : undefined;
    if (previousPath && previousPath !== input.avatarPath) {
      await this.client.storage.from("avatars").remove([previousPath]);
    }
    return (await this.getPlan(userId)).user;
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

  async selfConfirmSettlement(userId: string, settlementId: string, idempotencyKey: string): Promise<void> {
    const { error } = await this.client.rpc("app_self_confirm_settlement", {
      p_actor: userId,
      p_settlement: settlementId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      if (error.message.includes("only the payer")) throw new ForbiddenError("Only the payer can use fallback settlement");
      if (error.message.includes("window is open") || error.message.includes("already been resolved")) throw new ConflictError(error.message);
      if (error.message.includes("not found")) throw new NotFoundError("Settlement not found");
      throw new DomainError(error.message, 400, "database_error");
    }
  }

  async storeImage(userId: string, kind: UploadKind, contentType: string, bytes: Buffer): Promise<{ path: string }> {
    const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
    const bucket = kind === "receipt" ? "receipts" : kind === "avatar" ? "avatars" : "payment-proofs";
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

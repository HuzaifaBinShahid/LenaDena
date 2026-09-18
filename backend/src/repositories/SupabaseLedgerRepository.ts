import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ConflictError, DomainError, ForbiddenError, NotFoundError } from "../domain/errors.js";
import { cleanNewPerson, cleanPersonChanges, invalidAvatarPath, invalidPersonEmail, invalidPersonName, InviteRecentlySentError, isUuid, PeopleUnavailableError, PersonExistsError, PersonHasNoEmailError, PersonNotFoundError } from "../domain/people.js";
import type { CreateExpenseInput, CreateGroupInput, CreatePersonalTransactionInput, CreatePersonInput, CreateSettlementInput, Group, InviteLink, Member, Person, Plan, SettlementStatus, TransactionItem, UpdatePersonInput, UpdateProfileInput, UploadKind } from "../domain/types.js";
import type { LedgerRepository } from "./LedgerRepository.js";

type RepositoryLogger = { warn: (message: string) => void };
type RpcError = { message: string; code?: string };

const AVATAR_URL_TTL_SECONDS = 3600;

/** PostgREST answers PGRST202 for an RPC missing from its schema cache; Postgres itself raises 42883. */
function isMissingFunction(error: RpcError) {
  return error.code === "PGRST202" || error.code === "42883";
}

/** The People RPCs raise these identifiers (supabase/migrations/202609180007_people.sql). */
function toPeopleError(error: RpcError): DomainError {
  if (isMissingFunction(error)) return new PeopleUnavailableError();
  if (error.message.includes("person_exists") || error.code === "23505") return new PersonExistsError();
  if (error.message.includes("person_not_found")) return new PersonNotFoundError();
  if (error.message.includes("invalid_person_name")) return invalidPersonName();
  if (error.message.includes("invalid_person_email")) return invalidPersonEmail();
  if (error.message.includes("invalid_avatar_path")) return invalidAvatarPath();
  if (error.message.includes("person_has_no_email")) return new PersonHasNoEmailError();
  if (error.message.includes("invite_recently_sent")) return new InviteRecentlySentError();
  // The route only passes vetted https links, so this means a bad APP_DOWNLOAD_URL slipped past config.
  if (error.message.includes("invalid_download_url")) return new DomainError("The app download link is not a valid https URL.", 400, "invalid_download_url");
  return new DomainError(error.message, 400, "database_error");
}

function withAvatarUrl(person: Person, signed: Map<string, string>): Person {
  const avatarUrl = person.avatarPath ? signed.get(person.avatarPath) : undefined;
  return avatarUrl ? { ...person, avatarUrl } : person;
}

export class SupabaseLedgerRepository implements LedgerRepository {
  private warnedPeopleMissing = false;

  constructor(private readonly client: SupabaseClient, private readonly log: RepositoryLogger = console) {}

  async getPlan(userId: string): Promise<Plan> {
    const { error: touchError } = await this.client.rpc("app_touch_profile", { p_actor: userId });
    if (touchError) throw new DomainError(touchError.message, 500, "database_error");
    const [planResult, transactionResult, people] = await Promise.all([
      this.client.rpc("app_get_plan", { p_actor: userId }),
      this.client.rpc("app_get_transactions", { p_actor: userId }),
      this.listPeopleForPlan(userId),
    ]);
    const { data, error } = planResult;
    if (error) throw new DomainError(error.message, 500, "database_error");
    if (!data) throw new NotFoundError("Profile not found");
    const { data: transactionData, error: transactionError } = transactionResult;
    if (transactionError) throw new DomainError(transactionError.message, 500, "database_error");
    const basePlan = data as Omit<Plan, "transactions" | "claims" | "people"> & { claims?: Plan["claims"] };
    const plan: Plan = { ...basePlan, claims: basePlan.claims ?? [], transactions: (transactionData ?? []) as TransactionItem[], people };
    await Promise.all([...plan.reviews, ...plan.claims].map(async (review) => {
      if (!review.proofUri) return;
      const { data: signed, error: signedError } = await this.client.storage.from("payment-proofs").createSignedUrl(review.proofUri, 300);
      if (!signedError && signed?.signedUrl) review.proofUri = signed.signedUrl;
    }));
    const receiptPaths = Array.from(new Set(plan.transactions.map((transaction) => transaction.receiptUri).filter((value): value is string => Boolean(value))));
    const signedReceipts = new Map<string, string>();
    await Promise.all(receiptPaths.map(async (path) => {
      const { data: signed, error: signedError } = await this.client.storage.from("receipts").createSignedUrl(path, 300);
      if (!signedError && signed?.signedUrl) signedReceipts.set(path, signed.signedUrl);
    }));
    for (const transaction of plan.transactions) {
      if (!transaction.receiptUri) continue;
      const signedUrl = signedReceipts.get(transaction.receiptUri);
      if (signedUrl) transaction.receiptUri = signedUrl;
    }
    const members: Member[] = [plan.user, ...plan.groups.flatMap((group) => group.members), ...plan.reviews.flatMap((review) => [review.debtor, review.recipient]), ...plan.claims.flatMap((claim) => [claim.debtor, claim.recipient])];
    const signedAvatars = await this.signAvatarPaths([...members.map((member) => member.avatarUrl), ...people.map((person) => person.avatarPath)]);
    for (const member of members) {
      if (!member.avatarUrl) continue;
      const signedUrl = signedAvatars.get(member.avatarUrl);
      if (signedUrl) member.avatarUrl = signedUrl;
    }
    plan.people = people.map((person) => withAvatarUrl(person, signedAvatars));
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
      // `personId` travels inside the payload, so a database without the People migration simply ignores it.
      p_payload: input,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      if (error.message.includes("person_not_found")) throw new PersonNotFoundError();
      throw new DomainError(error.message, 400, "database_error");
    }
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

  async createPerson(userId: string, input: CreatePersonInput): Promise<Person> {
    const details = cleanNewPerson(userId, input);
    const { data, error } = await this.client.rpc("app_create_person", { p_actor: userId, p_payload: details });
    if (error) throw toPeopleError(error);
    return this.getPerson(userId, String(data));
  }

  async updatePerson(userId: string, personId: string, input: UpdatePersonInput): Promise<Person> {
    if (!isUuid(personId)) throw new PersonNotFoundError();
    const changes = cleanPersonChanges(userId, input);
    const changesPhoto = changes.avatarPath !== undefined;
    const previousPhoto = changesPhoto ? (await this.findPerson(userId, personId)).avatarPath : undefined;
    const { error } = await this.client.rpc("app_update_person", {
      p_actor: userId,
      p_person: personId,
      // Explicit flags keep "leave as is" (flag false) apart from "clear" (flag true, value null).
      p_payload: {
        updateName: changes.name !== undefined,
        name: changes.name ?? null,
        updateEmail: changes.email !== undefined,
        email: changes.email ?? null,
        updateAvatar: changesPhoto,
        avatarPath: changes.avatarPath ?? null,
      },
    });
    if (error) throw toPeopleError(error);
    const people = await this.listPeople(userId);
    if (previousPhoto && !people.some((person) => person.avatarPath === previousPhoto)) await this.removeAvatar(previousPhoto);
    return this.getPerson(userId, personId, people);
  }

  async deletePerson(userId: string, personId: string): Promise<void> {
    if (!isUuid(personId)) throw new PersonNotFoundError();
    const people = await this.listPeople(userId);
    const person = people.find((item) => item.id === personId);
    if (!person) throw new PersonNotFoundError();
    const { error } = await this.client.rpc("app_delete_person", { p_actor: userId, p_person: personId });
    if (error) throw toPeopleError(error);
    const photo = person.avatarPath;
    if (photo && !people.some((item) => item.id !== personId && item.avatarPath === photo)) await this.removeAvatar(photo);
  }

  async invitePerson(userId: string, personId: string, downloadUrl: string | null): Promise<{ queuedAt: string }> {
    if (!isUuid(personId)) throw new PersonNotFoundError();
    const { data, error } = await this.client.rpc("app_invite_person", { p_actor: userId, p_person: personId, p_download_url: downloadUrl });
    if (error) throw toPeopleError(error);
    const queued = new Date(String(data));
    return { queuedAt: Number.isNaN(queued.getTime()) ? new Date().toISOString() : queued.toISOString() };
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

  /** Plans keep loading on a database without the People migration (202609180007), just with no people. */
  private async listPeopleForPlan(userId: string): Promise<Person[]> {
    const { data, error } = await this.client.rpc("app_get_people", { p_actor: userId });
    if (error && isMissingFunction(error)) {
      if (!this.warnedPeopleMissing) {
        this.warnedPeopleMissing = true;
        this.log.warn("People RPCs are missing: apply supabase/migrations/202609180007_people.sql. Plans list no people until then.");
      }
      return [];
    }
    if (error) throw new DomainError(error.message, 500, "database_error");
    this.warnedPeopleMissing = false;
    return (data ?? []) as Person[];
  }

  private async listPeople(userId: string): Promise<Person[]> {
    const { data, error } = await this.client.rpc("app_get_people", { p_actor: userId });
    if (error) throw toPeopleError(error);
    return (data ?? []) as Person[];
  }

  private async findPerson(userId: string, personId: string, people?: Person[]): Promise<Person> {
    const person = (people ?? await this.listPeople(userId)).find((item) => item.id === personId);
    if (!person) throw new PersonNotFoundError();
    return person;
  }

  private async getPerson(userId: string, personId: string, people?: Person[]): Promise<Person> {
    const person = await this.findPerson(userId, personId, people);
    return withAvatarUrl(person, await this.signAvatarPaths([person.avatarPath]));
  }

  /** Signs every photo in one storage request. A photo that can't be signed gets no URL; callers keep their fallback. */
  private async signAvatarPaths(paths: Array<string | undefined>): Promise<Map<string, string>> {
    const signed = new Map<string, string>();
    const unique = Array.from(new Set(paths.filter((path): path is string => Boolean(path))));
    if (unique.length === 0) return signed;
    try {
      const { data, error } = await this.client.storage.from("avatars").createSignedUrls(unique, AVATAR_URL_TTL_SECONDS);
      if (error || !data) return signed;
      for (const item of data) {
        if (!item.error && item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
      }
    } catch {
      // Photos are decoration; the response still works without them.
    }
    return signed;
  }

  /** Best effort, like replaced profile photos: a leftover file never fails the request. */
  private async removeAvatar(path: string) {
    try {
      await this.client.storage.from("avatars").remove([path]);
    } catch {
      // A stale file only costs storage.
    }
  }
}

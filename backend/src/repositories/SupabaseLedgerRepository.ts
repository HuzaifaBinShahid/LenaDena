import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ConflictError, DomainError, ForbiddenError, NotFoundError } from "../domain/errors.js";
import { AccountDeletionFailedError, AccountDeletionUnavailableError, ownStoragePaths } from "../domain/account.js";
import { ExportUnavailableError, type ExportDocument } from "../domain/export.js";
import { GroupsUnavailableError, toGroupError, type GroupPeople, type Invitation } from "../domain/groups.js";
import { PushUnavailableError, toPushError, type DatabaseHealth, type InvitationPushTarget, type NudgeDelivery, type PaymentPushEvent, type PaymentPushTarget, type PushPlatform } from "../domain/push.js";
import { amountBelowPaid, EditUnavailableError, entryHasPayments, entryNotFound, entrySettled, expenseNotFound, invalidAmount, invalidReceipt, notAllowedToDeleteExpense, notAllowedToEditExpense, participantLeft } from "../domain/edit.js";
import { cleanNewPerson, cleanPersonChanges, EmailLimitReachedError, EmailRecentlySentError, EmailUnavailableError, invalidAvatarPath, invalidPersonEmail, invalidPersonName, invalidReminderFrequency, InviteRecentlySentError, isUuid, PeopleUnavailableError, PersonExistsError, PersonHasNoEmailError, PersonHasNoEntriesError, PersonNotFoundError } from "../domain/people.js";
import type { CreatedPersonalTransaction, CreateExpenseInput, CreateGroupInput, CreatePersonalTransactionInput, CreatePersonInput, CreateSettlementInput, ExpenseDetail, Group, InviteLink, Member, Person, PersonUpdate, Plan, SettlementStatus, TransactionItem, UpdateExpenseInput, UpdatePersonalTransactionInput, UpdatePersonInput, UpdateProfileInput, UploadKind } from "../domain/types.js";
import type { LedgerRepository } from "./LedgerRepository.js";

type RepositoryLogger = { warn: (message: string) => void };
type RpcError = { message: string; code?: string };

const AVATAR_URL_TTL_SECONDS = 3600;

/** PostgREST answers PGRST202 for an RPC missing from its schema cache; Postgres itself raises 42883. */
function isMissingFunction(error: RpcError) {
  return error.code === "PGRST202" || error.code === "42883";
}

/** The edit and delete RPCs raise these identifiers (supabase/migrations/202611170013_edit_delete_entries.sql). */
function toEditError(error: RpcError, action: "edit" | "delete" = "edit"): DomainError {
  if (isMissingFunction(error)) return new EditUnavailableError();
  const text = error.message;
  if (text.includes("expense_not_found")) return expenseNotFound();
  if (text.includes("entry_not_found")) return entryNotFound();
  if (text.includes("not_allowed")) return action === "delete" ? notAllowedToDeleteExpense() : notAllowedToEditExpense();
  if (text.includes("participant_left")) return participantLeft();
  if (text.includes("entry_has_payments")) return entryHasPayments();
  if (text.includes("entry_settled")) return entrySettled();
  if (text.includes("amount_below_paid")) return amountBelowPaid();
  if (text.includes("invalid_receipt_path")) return invalidReceipt();
  if (text.includes("invalid_amount")) return invalidAmount();
  if (text.includes("person_not_found")) return new PersonNotFoundError();
  return new DomainError(text, 400, "database_error");
}

/** The group-management RPCs (supabase/migrations/202611170015_group_members.sql). */
function toGroupRpcError(error: RpcError): DomainError {
  return isMissingFunction(error) ? new GroupsUnavailableError() : toGroupError(error.message);
}

function toPushRpcError(error: RpcError): DomainError {
  return isMissingFunction(error) ? new PushUnavailableError() : toPushError(error.message);
}

/** A receipt change travels as a payload key only when the caller sent one: absent keeps the photo, null removes it. */
function withReceiptChange<T extends { receiptUri?: string | null }>(input: T): Omit<T, "receiptUri"> & { receiptUri?: string | null } {
  const { receiptUri, ...rest } = input;
  return receiptUri === undefined ? rest : { ...rest, receiptUri: receiptUri || null };
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
  if (error.message.includes("invalid_reminder_frequency")) return invalidReminderFrequency();
  // The route only passes vetted https links, so this means a bad APP_DOWNLOAD_URL slipped past config.
  if (error.message.includes("invalid_download_url")) return new DomainError("The app download link is not a valid https URL.", 400, "invalid_download_url");
  return new DomainError(error.message, 400, "database_error");
}

/**
 * The email RPCs (supabase/migrations/202611100010_person_emails.sql). A database without that migration has no
 * such function, which answers 503 so the app can say what is missing instead of a vague failure.
 */
function toEmailError(error: RpcError): DomainError {
  if (isMissingFunction(error)) return new EmailUnavailableError();
  if (error.message.includes("email_recently_sent")) return new EmailRecentlySentError();
  if (error.message.includes("email_limit_reached")) return new EmailLimitReachedError();
  if (error.message.includes("no_entries")) return new PersonHasNoEntriesError();
  return toPeopleError(error);
}

/** Rows from a database before migration 202611100010 carry neither setting: treat them as the defaults. */
function withEmailSettings(person: Person): Person {
  return { ...person, emailUpdates: person.emailUpdates ?? true, reminderFrequency: person.reminderFrequency ?? "off" };
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

  async createPersonalTransaction(userId: string, input: CreatePersonalTransactionInput, idempotencyKey: string): Promise<CreatedPersonalTransaction> {
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
    // Saving an entry sends no email. (The database function app_notify_new_entry is no longer called.)
    return { id: String(data) };
  }

  async getExpense(userId: string, expenseId: string): Promise<ExpenseDetail> {
    if (!isUuid(expenseId)) throw expenseNotFound();
    const { data, error } = await this.client.rpc("app_get_expense", { p_actor: userId, p_expense: expenseId });
    if (error) throw toEditError(error);
    const detail = data as ExpenseDetail;
    if (!detail.receiptPath) return detail;
    const { data: signed } = await this.client.storage.from("receipts").createSignedUrl(detail.receiptPath, 300);
    return signed?.signedUrl ? { ...detail, receiptUrl: signed.signedUrl } : detail;
  }

  async updateExpense(userId: string, expenseId: string, input: UpdateExpenseInput, idempotencyKey: string): Promise<{ id: string }> {
    if (!isUuid(expenseId)) throw expenseNotFound();
    const { data, error } = await this.client.rpc("app_update_expense", {
      p_actor: userId,
      p_expense: expenseId,
      p_payload: withReceiptChange(input),
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw toEditError(error);
    const result = data as { id: string; previousReceiptPath?: string | null };
    await this.removeReceipt(result.previousReceiptPath);
    return { id: result.id };
  }

  async deleteExpense(userId: string, expenseId: string): Promise<void> {
    if (!isUuid(expenseId)) throw expenseNotFound();
    const { data, error } = await this.client.rpc("app_delete_expense", { p_actor: userId, p_expense: expenseId });
    if (error) throw toEditError(error, "delete");
    await this.removeReceipt((data as { receiptPath?: string | null } | null)?.receiptPath);
  }

  async updatePersonalTransaction(userId: string, transactionId: string, input: UpdatePersonalTransactionInput): Promise<{ id: string }> {
    if (!isUuid(transactionId)) throw entryNotFound();
    const { data, error } = await this.client.rpc("app_update_personal_transaction", {
      p_actor: userId,
      p_id: transactionId,
      p_payload: withReceiptChange(input),
    });
    if (error) throw toEditError(error);
    const result = data as { id: string; previousReceiptPath?: string | null };
    await this.removeReceipt(result.previousReceiptPath);
    return { id: result.id };
  }

  async deletePersonalTransaction(userId: string, transactionId: string): Promise<void> {
    if (!isUuid(transactionId)) throw entryNotFound();
    const { data, error } = await this.client.rpc("app_delete_personal_transaction", { p_actor: userId, p_id: transactionId });
    if (error) throw toEditError(error, "delete");
    await this.removeReceipt((data as { receiptPath?: string | null } | null)?.receiptPath);
  }

  async inviteMember(userId: string, groupId: string, email: string): Promise<InviteLink> {
    if (!isUuid(groupId)) throw toGroupError("group_not_found");
    const { data, error } = await this.client.rpc("app_invite_member", { p_actor: userId, p_group: groupId, p_email: email });
    if (error) throw toGroupRpcError(error);
    return data as InviteLink;
  }

  async listInvitations(userId: string): Promise<Invitation[]> {
    const { data, error } = await this.client.rpc("app_list_invitations", { p_actor: userId });
    if (error) throw toGroupRpcError(error);
    return (data ?? []) as Invitation[];
  }

  async acceptInvitation(userId: string, invitationId: string): Promise<Group> {
    if (!isUuid(invitationId)) throw toGroupError("invitation_not_found");
    const { data, error } = await this.client.rpc("app_accept_invitation", { p_actor: userId, p_invite: invitationId });
    if (error) throw toGroupRpcError(error);
    return this.getGroup(userId, String(data));
  }

  async declineInvitation(userId: string, invitationId: string): Promise<void> {
    if (!isUuid(invitationId)) throw toGroupError("invitation_not_found");
    const { error } = await this.client.rpc("app_decline_invitation", { p_actor: userId, p_invite: invitationId });
    if (error) throw toGroupRpcError(error);
  }

  async getGroupPeople(userId: string, groupId: string): Promise<GroupPeople> {
    if (!isUuid(groupId)) throw toGroupError("group_not_found");
    const { data, error } = await this.client.rpc("app_get_group_people", { p_actor: userId, p_group: groupId });
    if (error) throw toGroupRpcError(error);
    const people = data as GroupPeople;
    const signed = await this.signAvatarPaths(people.members.map((member) => member.avatarPath));
    return {
      ...people,
      members: people.members.map(({ avatarPath, ...member }) => {
        const avatarUrl = avatarPath ? signed.get(avatarPath) : undefined;
        return avatarUrl ? { ...member, avatarUrl } : member;
      }),
    };
  }

  async leaveGroup(userId: string, groupId: string): Promise<void> {
    if (!isUuid(groupId)) throw toGroupError("group_not_found");
    const { error } = await this.client.rpc("app_leave_group", { p_actor: userId, p_group: groupId });
    if (error) throw toGroupRpcError(error);
  }

  async removeMember(userId: string, groupId: string, memberId: string): Promise<void> {
    if (!isUuid(groupId)) throw toGroupError("group_not_found");
    if (!isUuid(memberId)) throw toGroupError("member_not_found");
    const { error } = await this.client.rpc("app_remove_member", { p_actor: userId, p_group: groupId, p_member: memberId });
    if (error) throw toGroupRpcError(error);
  }

  async renameGroup(userId: string, groupId: string, name: string): Promise<void> {
    if (!isUuid(groupId)) throw toGroupError("group_not_found");
    const { error } = await this.client.rpc("app_rename_group", { p_actor: userId, p_group: groupId, p_name: name });
    if (error) throw toGroupRpcError(error);
  }

  async registerPushToken(userId: string, token: string, platform: PushPlatform): Promise<void> {
    const { error } = await this.client.rpc("app_register_push_token", { p_actor: userId, p_token: token, p_platform: platform });
    if (error) throw toPushRpcError(error);
  }

  async removePushToken(userId: string, token: string): Promise<void> {
    const { error } = await this.client.rpc("app_remove_push_token", { p_actor: userId, p_token: token });
    if (error) throw toPushRpcError(error);
  }

  async dropPushTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    const { error } = await this.client.rpc("app_drop_push_tokens", { p_tokens: tokens });
    if (error) throw toPushRpcError(error);
  }

  async createNudge(userId: string, groupId: string, memberId: string): Promise<NudgeDelivery> {
    if (!isUuid(groupId)) throw toPushError("group_not_found");
    if (!isUuid(memberId)) throw toPushError("member_not_found");
    const { data, error } = await this.client.rpc("app_create_nudge", { p_actor: userId, p_group: groupId, p_member: memberId });
    if (error) throw toPushRpcError(error);
    const delivery = data as NudgeDelivery;
    return { ...delivery, amountMinor: Number(delivery.amountMinor), tokens: delivery.tokens ?? [] };
  }

  async undoNudge(userId: string, nudgeId: string): Promise<void> {
    if (!isUuid(nudgeId)) return;
    const { error } = await this.client.rpc("app_undo_nudge", { p_actor: userId, p_nudge: nudgeId });
    if (error) throw toPushRpcError(error);
  }

  async getInvitationPushTarget(userId: string, groupId: string, email: string): Promise<InvitationPushTarget | null> {
    if (!isUuid(groupId)) return null;
    const { data, error } = await this.client.rpc("app_get_invitation_push_target", { p_actor: userId, p_group: groupId, p_email: email });
    if (error) throw toPushRpcError(error);
    return (data as InvitationPushTarget | null) ?? null;
  }

  async getPaymentPushTarget(userId: string, settlementId: string, event: PaymentPushEvent): Promise<PaymentPushTarget | null> {
    if (!isUuid(settlementId)) return null;
    const { data, error } = await this.client.rpc("app_get_payment_push_target", { p_actor: userId, p_settlement: settlementId, p_event: event });
    if (error) throw toPushRpcError(error);
    const target = data as PaymentPushTarget | null;
    return target ? { ...target, amountMinor: Number(target.amountMinor), tokens: target.tokens ?? [] } : null;
  }

  async checkHealth(timeoutMs: number): Promise<DatabaseHealth> {
    const { data, error } = await this.client.rpc("app_health_check").abortSignal(AbortSignal.timeout(timeoutMs));
    if (error) {
      // The database answered but the function is not there (migration 202611180017 is not applied): reachable, features unknown.
      if (isMissingFunction(error)) return { missing: null };
      throw new Error(error.message || "The database did not answer");
    }
    const missing = (data as { missing?: unknown } | null)?.missing;
    return { missing: Array.isArray(missing) ? missing.filter((item): item is string => typeof item === "string") : [] };
  }

  async exportData(userId: string): Promise<ExportDocument> {
    const { data, error } = await this.client.rpc("app_export_data", { p_actor: userId });
    if (error) {
      if (isMissingFunction(error)) throw new ExportUnavailableError();
      if (error.message.includes("profile_not_found")) throw new NotFoundError("Profile not found");
      throw new DomainError(error.message, 500, "database_error");
    }
    return data as ExportDocument;
  }

  async deleteAccount(userId: string): Promise<void> {
    // 1. What to remove from storage, read before any row goes. Nothing is changed yet, so a failure here is a clean retry.
    const listed = await this.client.rpc("app_account_storage_paths", { p_actor: userId });
    if (listed.error) throw isMissingFunction(listed.error) ? new AccountDeletionUnavailableError() : new AccountDeletionFailedError();
    const found = (listed.data ?? {}) as { avatars?: unknown; receipts?: unknown };
    // 2. Their files. If any cannot be removed, stop here: deleting the rows first would leave the files orphaned for good.
    for (const [bucket, paths] of [["avatars", ownStoragePaths(found.avatars, userId)], ["receipts", ownStoragePaths(found.receipts, userId)]] as const) {
      if (!paths.length) continue;
      const removed = await this.client.storage.from(bucket).remove(paths);
      if (removed.error) {
        this.log.warn(`Could not remove ${bucket} files while deleting an account: ${removed.error.message}`);
        throw new AccountDeletionFailedError("We couldn't remove your photos and receipts. Nothing was deleted; please try again.");
      }
    }
    // 3. Their data, and the anonymised placeholder that shared groups keep pointing at. One transaction.
    const deleted = await this.client.rpc("app_delete_account", { p_actor: userId });
    if (deleted.error) {
      this.log.warn(`app_delete_account failed: ${deleted.error.message}`);
      throw isMissingFunction(deleted.error) ? new AccountDeletionUnavailableError() : new AccountDeletionFailedError();
    }
    // 4. The sign-in itself, last: until now they could still sign in and retry. Already gone counts as done.
    const signIn = await this.client.auth.admin.deleteUser(userId);
    if (signIn.error && signIn.error.status !== 404 && signIn.error.code !== "user_not_found") {
      this.log.warn(`Could not delete the sign-in while deleting an account: ${signIn.error.message}`);
      throw new AccountDeletionFailedError("Your data is deleted but we couldn't close your sign-in. Please try again.");
    }
  }

  async settlePersonalTransaction(userId: string, transactionId: string, amountMinor: number | undefined, idempotencyKey: string): Promise<void> {
    const { error } = await this.client.rpc("app_settle_personal_transaction", {
      p_actor: userId,
      p_transaction: transactionId,
      p_amount_minor: amountMinor ?? null,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw new DomainError(error.message, 400, "database_error");
  }

  async settlePersonalTransactions(userId: string, transactionIds: string[], idempotencyKey: string): Promise<void> {
    const { error } = await this.client.rpc("app_settle_personal_transactions", {
      p_actor: userId,
      p_transactions: transactionIds,
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

  async updatePerson(userId: string, personId: string, input: UpdatePersonInput): Promise<PersonUpdate> {
    if (!isUuid(personId)) throw new PersonNotFoundError();
    const changes = cleanPersonChanges(userId, input);
    const changesPhoto = changes.avatarPath !== undefined;
    // Read before the update only when something below needs the old values.
    const before = changesPhoto ? await this.findPerson(userId, personId) : undefined;
    const previousPhoto = changesPhoto ? before?.avatarPath : undefined;
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
        updateEmailUpdates: changes.emailUpdates !== undefined,
        emailUpdates: changes.emailUpdates ?? null,
        updateReminderFrequency: changes.reminderFrequency !== undefined,
        reminderFrequency: changes.reminderFrequency ?? null,
      },
    });
    if (error) throw toPeopleError(error);
    const people = await this.listPeople(userId);
    if (previousPhoto && !people.some((person) => person.avatarPath === previousPhoto)) await this.removeAvatar(previousPhoto);
    // Adding or changing an address sends nothing: the owner sends a statement by hand.
    return this.getPerson(userId, personId, people);
  }

  async emailPerson(userId: string, personId: string): Promise<{ queuedAt: string }> {
    if (!isUuid(personId)) throw new PersonNotFoundError();
    const { data, error } = await this.client.rpc("app_queue_person_email", {
      p_actor: userId,
      p_person: personId,
      p_kind: "statement",
      p_transaction: null,
    });
    if (error) throw toEmailError(error);
    const queued = new Date(String(data));
    return { queuedAt: Number.isNaN(queued.getTime()) ? new Date().toISOString() : queued.toISOString() };
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
    return ((data ?? []) as Person[]).map(withEmailSettings);
  }

  private async listPeople(userId: string): Promise<Person[]> {
    const { data, error } = await this.client.rpc("app_get_people", { p_actor: userId });
    if (error) throw toPeopleError(error);
    return ((data ?? []) as Person[]).map(withEmailSettings);
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
  /**
   * Removes a receipt photo the database says is no longer used. The records are already changed, so a failure here
   * only leaves an unused file behind: it is logged, never thrown.
   */
  private async removeReceipt(path: string | null | undefined) {
    if (!path) return;
    try {
      const { error } = await this.client.storage.from("receipts").remove([path]);
      if (error) this.log.warn(`Could not remove a replaced receipt photo: ${error.message}`);
    } catch (error) {
      this.log.warn(`Could not remove a replaced receipt photo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async removeAvatar(path: string) {
    try {
      await this.client.storage.from("avatars").remove([path]);
    } catch {
      // A stale file only costs storage.
    }
  }
}

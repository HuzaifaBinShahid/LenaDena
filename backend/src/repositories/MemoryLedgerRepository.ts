import { randomUUID } from "node:crypto";
import { ConflictError, DomainError, ForbiddenError, NotFoundError } from "../domain/errors.js";
import type { ExportDocument } from "../domain/export.js";
import { toGroupError, type GroupPeople, type Invitation } from "../domain/groups.js";
import { toPushError, type DatabaseHealth, type InvitationPushTarget, type NudgeDelivery, type PaymentPushEvent, type PaymentPushTarget, type PushPlatform } from "../domain/push.js";
import { amountBelowPaid, entryHasPayments, entryNotFound, entrySettled, expenseNotFound, invalidAmount, notAllowedToDeleteExpense, notAllowedToEditExpense } from "../domain/edit.js";
import { pairKey, validateShares } from "../domain/money.js";
import { cleanNewPerson, cleanPersonChanges, cleanPersonName, DAILY_PERSON_EMAIL_LIMIT, EmailLimitReachedError, EmailRecentlySentError, InviteRecentlySentError, PERSON_INVITE_COOLDOWN_MS, PersonExistsError, PersonHasNoEntriesError, PersonHasNoEmailError, PersonNotFoundError, personNameKey, STATEMENT_COOLDOWN_MS } from "../domain/people.js";
import type {
  ActivityItem,
  CreatedPersonalTransaction,
  CreateExpenseInput,
  CreateGroupInput,
  CreatePersonalTransactionInput,
  CreatePersonInput,
  CreateSettlementInput,
  Expense,
  ExpenseDetail,
  Group,
  InviteLink,
  Member,
  Person,
  PersonUpdate,
  Plan,
  Settlement,
  SettlementStatus,
  TransactionItem,
  UpdateExpenseInput,
  UpdatePersonalTransactionInput,
  UpdatePersonInput,
  UpdateProfileInput,
  UploadKind,
} from "../domain/types.js";
import type { LedgerRepository } from "./LedgerRepository.js";

type StoredGroup = Omit<Group, "balanceMinor">;
/** Who added an expense and when it was last edited; the seeded expenses were added by their payer. */
type StoredExpense = Expense & { createdByMemberId?: string; editedAt?: string };
type StoredPersonalTransaction = TransactionItem & { userId: string };
type StoredPerson = Omit<Person, "avatarUrl"> & { ownerId: string };
/** An invite email the demo "outbox" would send (mirrors the person_invite rows of app_invite_person). */
export type QueuedPersonInvite = {
  ownerId: string;
  personId: string;
  personName: string;
  inviterName: string;
  email: string;
  downloadUrl: string | null;
  queuedAt: string;
};

/**
 * An email the demo "outbox" would send to a saved person (mirrors the person_statement, person_entry and
 * person_reminder rows of supabase/migrations/202611100010_person_emails.sql). Demo mode sends nothing.
 */
export type QueuedPersonEmail = {
  ownerId: string;
  personId: string;
  personName: string;
  email: string;
  kind: "statement" | "entry" | "reminder";
  /** Entries an `entry` email is about; entries added together share one email. */
  transactionIds: string[];
  queuedAt: string;
  /** When it would go out (entry emails wait a moment so entries added together are one email). */
  availableAt: string;
};

export type MemoryLedgerOptions = {
  /** Clock for time-based rules (the invite cooldown); tests move it forward. */
  now?: () => Date;
};

const demoUser: Member = { id: "demo-user", name: "Huzaifa", email: "huzaifa@example.com", createdAt: "2026-09-01T09:00:00.000Z" };
const sara: Member = { id: "sara", name: "Sara", email: "sara@example.com", createdAt: "2026-09-04T09:00:00.000Z" };
const hamza: Member = { id: "hamza", name: "Hamza", email: "hamza@example.com", createdAt: "2026-09-03T09:00:00.000Z" };
// A real UUID, so demo clients can send it as `personId` (the API validates the format).
const demoPersonAliId = "5d1c9a7e-3b2f-4e8a-9c6d-2f7b8e4a1c03";

export class MemoryLedgerRepository implements LedgerRepository {
  private readonly now: () => Date;
  private readonly personInvites: QueuedPersonInvite[] = [];
  private readonly personEmails: QueuedPersonEmail[] = [];

  constructor(options: MemoryLedgerOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  private readonly users = new Map<string, Member>([
    [demoUser.id, demoUser],
    [sara.id, sara],
    [hamza.id, hamza],
  ]);
  private readonly groups = new Map<string, StoredGroup>([
    ["weekend-crew", { id: "weekend-crew", name: "Weekend crew", currency: "PKR", accent: "#35C4A5", role: "owner", members: [demoUser, sara, hamza] }],
    ["flat-bills", { id: "flat-bills", name: "Flat bills", currency: "PKR", accent: "#D79A31", role: "member", members: [demoUser, hamza] }],
  ]);
  private readonly expenses: StoredExpense[] = [
    {
      id: "expense-1",
      groupId: "weekend-crew",
      eventName: "Dinner at Monal",
      eventDate: "2026-09-11",
      amountMinor: 480000,
      currency: "PKR",
      paidByMemberId: sara.id,
      splitMethod: "equal",
      shares: [
        { memberId: demoUser.id, amountMinor: 240000 },
        { memberId: sara.id, amountMinor: 240000 },
      ],
      createdAt: "2026-09-11T19:10:00.000Z",
    },
    {
      id: "expense-2",
      groupId: "flat-bills",
      eventName: "September internet",
      eventDate: "2026-09-05",
      amountMinor: 220000,
      currency: "PKR",
      paidByMemberId: demoUser.id,
      splitMethod: "equal",
      shares: [
        { memberId: demoUser.id, amountMinor: 110000 },
        { memberId: hamza.id, amountMinor: 110000 },
      ],
      createdAt: "2026-09-05T12:00:00.000Z",
    },
  ];
  private readonly settlements: Settlement[] = [
    {
      id: "review-1",
      groupId: "flat-bills",
      debtor: hamza,
      recipient: demoUser,
      amountMinor: 110000,
      currency: "PKR",
      status: "awaiting_review",
      eventName: "September internet",
      eventDate: "2026-09-05",
      note: "Bank transfer",
      createdAt: "2026-09-12T11:32:00.000Z",
    },
  ];
  private readonly activity: ActivityItem[] = [
    { id: "activity-1", groupId: "flat-bills", icon: "send", title: "Hamza says he paid", detail: "Rs 1,100 · Flat bills", createdAt: "2026-09-12T11:32:00.000Z", tone: "warning" },
    { id: "activity-2", groupId: "weekend-crew", icon: "file-text", title: "Dinner at Monal", detail: "Rs 4,800 split with 2 friends", createdAt: "2026-09-11T19:10:00.000Z", tone: "neutral" },
  ];
  private readonly personalTransactions: StoredPersonalTransaction[] = [
    { id: "personal-1", userId: demoUser.id, source: "personal", title: "Coffee money", eventDate: "2026-09-13", amountMinor: 185000, currency: "PKR", direction: "outgoing", kind: "expense", counterparty: "Ali", personId: demoPersonAliId, status: "open", settledAmountMinor: 0, createdAt: "2026-09-13T08:20:00.000Z" },
    { id: "personal-2", userId: demoUser.id, source: "personal", title: "Camera loan", eventDate: "2026-09-08", amountMinor: 1200000, currency: "PKR", direction: "incoming", kind: "loan", counterparty: "Ali", personId: demoPersonAliId, status: "settled", settledAmountMinor: 1200000, settledAt: "2026-09-10T17:45:00.000Z", createdAt: "2026-09-08T17:45:00.000Z" },
  ];
  // Matches the seeded individual balances, like the migration's backfill does for existing entries.
  private readonly people: StoredPerson[] = [
    { id: demoPersonAliId, ownerId: demoUser.id, name: "Ali", email: "ali@example.com", emailUpdates: true, reminderFrequency: "off", createdAt: "2026-09-08T17:45:00.000Z" },
  ];
  private readonly idempotency = new Map<string, unknown>();
  /** Invitations by email (the demo twin of public.group_invites rows that have an address). */
  private readonly invitations: Array<{ id: string; groupId: string; email: string; invitedBy: string; token: string; createdAt: string; expiresAt: string; accepted?: boolean; revoked?: boolean }> = [];
  private readonly invites = new Map<string, { groupId: string; email?: string; expiresAt: string; accepted: boolean }>();
  /** Registered phones and recorded reminders (the demo twins of public.push_tokens and public.nudges). */
  private pushTokens: Array<{ userId: string; token: string; platform: PushPlatform; createdAt: string; lastSeenAt: string }> = [];
  private readonly nudges: Array<{ id: string; groupId: string; senderId: string; recipientId: string; createdAt: string }> = [];
  /** `<settlement id>:<event>` for every payment notification already handed out, so a retry cannot send it twice. */
  private readonly paymentPushes = new Set<string>();
  private readonly lastSeenAt = new Map<string, string>([[demoUser.id, new Date().toISOString()], [hamza.id, new Date().toISOString()]]);

  async getPlan(userId: string): Promise<Plan> {
    const user = this.users.get(userId);
    if (!user) {
      throw new NotFoundError("Profile not found");
    }
    this.lastSeenAt.set(userId, new Date().toISOString());
    const groups = Array.from(this.groups.values())
      .filter((group) => group.members.some((member) => member.id === userId))
      .map((group) => ({ ...group, role: group.members[0]?.id === userId ? "owner" as const : "member" as const, balanceMinor: this.getGroupBalance(group.id, userId) }));
    const groupIds = new Set(groups.map((group) => group.id));
    const reviews = this.settlements.filter((settlement) => settlement.recipient.id === userId && settlement.status === "awaiting_review");
    const claims = this.settlements
      .filter((settlement) => settlement.debtor.id === userId && settlement.status === "awaiting_review")
      .map((settlement) => {
        const recipientHasOpenedApp = this.lastSeenAt.has(settlement.recipient.id);
        const selfSettleAvailableAt = recipientHasOpenedApp
          ? new Date(Date.parse(settlement.createdAt) + 72 * 60 * 60 * 1000).toISOString()
          : settlement.createdAt;
        return { ...settlement, recipientHasOpenedApp, selfSettleAvailableAt, canSelfSettle: Date.now() >= Date.parse(selfSettleAvailableAt) };
      });
    const activity = this.activity.filter((item) => groupIds.has(item.groupId)).map(({ groupId: _groupId, ...item }) => item);
    const expenseTransactions: TransactionItem[] = this.expenses
      .filter((expense) => groupIds.has(expense.groupId) && (expense.paidByMemberId === userId || expense.shares.some((share) => share.memberId === userId)))
      .map((expense) => {
        const group = groups.find((item) => item.id === expense.groupId);
        const payer = this.users.get(expense.paidByMemberId);
        const paidByUser = expense.paidByMemberId === userId;
        const relevantAmount = paidByUser
          ? expense.shares.filter((share) => share.memberId !== userId).reduce((sum, share) => sum + share.amountMinor, 0)
          : expense.shares.find((share) => share.memberId === userId)?.amountMinor ?? 0;
        return {
          id: expense.id,
          source: "group" as const,
          groupId: expense.groupId,
          groupName: group?.name ?? "Group",
          title: expense.eventName,
          eventDate: expense.eventDate,
          amountMinor: relevantAmount,
          currency: expense.currency,
          direction: paidByUser ? "incoming" as const : "outgoing" as const,
          kind: "expense" as const,
          ...(!paidByUser && payer ? { counterparty: payer.name } : {}),
          ...(expense.note ? { note: expense.note } : {}),
          ...(group ? this.expenseAccess(userId, expense, group) : { canEdit: false, canDelete: false }),
          ...(expense.editedAt ? { editedAt: expense.editedAt } : {}),
          createdAt: expense.createdAt,
        };
      })
      .filter((transaction) => transaction.amountMinor > 0);
    const settlementTransactions: TransactionItem[] = this.settlements
      .filter((settlement) => settlement.status === "confirmed" && groupIds.has(settlement.groupId) && (settlement.debtor.id === userId || settlement.recipient.id === userId))
      .map((settlement) => ({
        id: settlement.id,
        source: "group" as const,
        groupId: settlement.groupId,
        groupName: groups.find((item) => item.id === settlement.groupId)?.name ?? "Group",
        title: settlement.confirmationMethod === "claimant_fallback" ? "Payment marked settled by payer" : "Payment completed",
        eventDate: settlement.createdAt.slice(0, 10),
        amountMinor: settlement.amountMinor,
        currency: settlement.currency,
        direction: settlement.recipient.id === userId ? "incoming" as const : "outgoing" as const,
        kind: "payment" as const,
        counterparty: settlement.recipient.id === userId ? settlement.debtor.name : settlement.recipient.name,
        canEdit: false,
        canDelete: false,
        createdAt: settlement.createdAt,
      }));
    const personalTransactions = this.personalTransactions
      .filter((transaction) => transaction.userId === userId)
      .map(({ userId: _userId, ...transaction }) => ({ ...transaction, canEdit: true, canDelete: true }));
    const transactions = [...personalTransactions, ...expenseTransactions, ...settlementTransactions]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const totals = Array.from(new Set(groups.map((group) => group.currency))).map((currency) => ({
      currency,
      oweMinor: groups.filter((group) => group.currency === currency).reduce((sum, group) => sum + Math.max(0, -group.balanceMinor), 0),
      owedMinor: groups.filter((group) => group.currency === currency).reduce((sum, group) => sum + Math.max(0, group.balanceMinor), 0),
    }));
    return { user, totals, groups, reviews, claims, activity, transactions, people: this.listPeople(userId) };
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<Member> {
    const user = this.users.get(userId);
    if (!user) throw new NotFoundError("Profile not found");
    const name = input.name.trim();
    if (!name) throw new DomainError("Enter your name");
    user.name = name;
    if (Object.hasOwn(input, "avatarPath")) {
      if (input.avatarPath) user.avatarUrl = input.avatarPath;
      else delete user.avatarUrl;
    }
    return { ...user };
  }

  async getGroup(userId: string, groupId: string): Promise<Group> {
    const group = this.requireMembership(userId, groupId);
    return { ...group, role: group.members[0]?.id === userId ? "owner" : "member", balanceMinor: this.getGroupBalance(groupId, userId) };
  }

  async createGroup(userId: string, input: CreateGroupInput, idempotencyKey: string): Promise<Group> {
    const cached = this.idempotency.get(`${userId}:${idempotencyKey}`) as Group | undefined;
    if (cached) {
      return cached;
    }
    const owner = this.users.get(userId);
    if (!owner) {
      throw new NotFoundError("Profile not found");
    }
    const stored: StoredGroup = { id: randomUUID(), name: input.name, currency: input.currency, accent: input.accent, role: "owner", members: [owner] };
    this.groups.set(stored.id, stored);
    await Promise.all(input.inviteEmails.map((email) => this.createInvite(userId, stored.id, email)));
    const group = { ...stored, balanceMinor: 0 };
    this.idempotency.set(`${userId}:${idempotencyKey}`, group);
    this.activity.unshift({ id: randomUUID(), groupId: group.id, icon: "users", title: `${owner.name} created ${group.name}`, detail: `${group.members.length} members`, createdAt: new Date().toISOString(), tone: "positive" });
    return group;
  }

  async createExpense(userId: string, input: CreateExpenseInput, idempotencyKey: string): Promise<{ id: string }> {
    const key = `${userId}:${idempotencyKey}`;
    const cached = this.idempotency.get(key) as { id: string } | undefined;
    if (cached) return cached;
    const group = this.requireMembership(userId, input.groupId);
    if (!group.members.some((member) => member.id === input.paidByMemberId)) {
      throw new ForbiddenError("Expense payer must be a group member");
    }
    if (input.shares.some((share) => !group.members.some((member) => member.id === share.memberId))) {
      throw new ForbiddenError("Every expense participant must be a group member");
    }
    validateShares(input.amountMinor, input.splitMethod, input.shares);
    const expense: StoredExpense = {
      id: randomUUID(),
      createdByMemberId: userId,
      groupId: input.groupId,
      eventName: input.eventName,
      eventDate: input.eventDate,
      ...(input.note ? { note: input.note } : {}),
      amountMinor: input.amountMinor,
      currency: group.currency,
      paidByMemberId: input.paidByMemberId,
      splitMethod: input.splitMethod,
      shares: input.shares,
      ...(input.receiptUri ? { receiptPath: input.receiptUri } : {}),
      createdAt: new Date().toISOString(),
    };
    this.expenses.unshift(expense);
    const result = { id: expense.id };
    this.idempotency.set(key, result);
    this.activity.unshift({ id: randomUUID(), groupId: group.id, icon: "file-text", title: expense.eventName, detail: `${(expense.amountMinor / 100).toFixed(2)} ${group.currency} · ${expense.shares.length} people`, createdAt: expense.createdAt, tone: "neutral" });
    return result;
  }

  async createPersonalTransaction(userId: string, input: CreatePersonalTransactionInput, idempotencyKey: string): Promise<CreatedPersonalTransaction> {
    const key = `${userId}:${idempotencyKey}`;
    const cached = this.idempotency.get(key) as CreatedPersonalTransaction | undefined;
    if (cached) return cached;
    if (!this.users.has(userId)) throw new NotFoundError("Profile not found");
    let person: StoredPerson;
    if (input.personId) {
      const owned = this.people.find((item) => item.id === input.personId && item.ownerId === userId);
      if (!owned) throw new PersonNotFoundError();
      person = owned;
    } else {
      if (!input.counterparty.trim()) throw new DomainError("Choose who this amount is with");
      person = this.findPersonByName(userId, input.counterparty) ?? this.addPerson(userId, { name: cleanPersonName(input.counterparty), email: null, avatarPath: null });
    }
    const transaction: StoredPersonalTransaction = {
      id: randomUUID(),
      userId,
      source: "personal",
      title: input.title.trim(),
      eventDate: input.eventDate,
      amountMinor: input.amountMinor,
      currency: input.currency.toUpperCase(),
      direction: input.direction,
      kind: input.kind,
      // The person's current name, so every entry with them reads the same.
      counterparty: person.name,
      personId: person.id,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      ...(input.receiptUri ? { receiptUri: input.receiptUri } : {}),
      status: "open",
      settledAmountMinor: 0,
      createdAt: new Date().toISOString(),
    };
    this.personalTransactions.unshift(transaction);
    // Saving an entry sends no email.
    const result: CreatedPersonalTransaction = { id: transaction.id };
    this.idempotency.set(key, result);
    return result;
  }

  async settlePersonalTransaction(userId: string, transactionId: string, amountMinor: number | undefined, idempotencyKey: string): Promise<void> {
    const key = `${userId}:${idempotencyKey}`;
    if (this.idempotency.has(key)) return;
    const transaction = this.personalTransactions.find((item) => item.id === transactionId && item.userId === userId);
    if (!transaction) throw new NotFoundError("Individual entry not found");
    if (transaction.status !== "settled") {
      const paid = transaction.settledAmountMinor ?? 0;
      const remaining = Math.max(0, transaction.amountMinor - paid);
      const amount = amountMinor ?? remaining;
      if (amount <= 0) throw new DomainError("Enter an amount greater than zero");
      if (amount > remaining) throw new DomainError("The amount is more than what is left on this entry");
      transaction.settledAmountMinor = paid + amount;
      if (transaction.settledAmountMinor >= transaction.amountMinor) {
        transaction.settledAmountMinor = transaction.amountMinor;
        transaction.status = "settled";
      }
      transaction.settledAt = new Date().toISOString();
    }
    this.idempotency.set(key, true);
  }

  async settlePersonalTransactions(userId: string, transactionIds: string[], idempotencyKey: string): Promise<void> {
    const key = `${userId}:${idempotencyKey}`;
    if (this.idempotency.has(key)) return;
    const selected = new Set(transactionIds);
    const transactions = this.personalTransactions.filter((item) => selected.has(item.id));
    // Check ownership before changing anything, so the operation is all-or-nothing.
    if (transactions.length !== selected.size || transactions.some((item) => item.userId !== userId)) {
      throw new NotFoundError("Individual entry not found");
    }
    const settledAt = new Date().toISOString();
    for (const transaction of transactions) {
      if (transaction.status !== "settled") {
        transaction.status = "settled";
        transaction.settledAmountMinor = transaction.amountMinor;
        transaction.settledAt = settledAt;
      }
    }
    this.idempotency.set(key, true);
  }

  async createPerson(userId: string, input: CreatePersonInput): Promise<Person> {
    if (!this.users.has(userId)) throw new NotFoundError("Profile not found");
    const details = cleanNewPerson(userId, input, { allowLocalUri: true });
    if (this.findPersonByName(userId, details.name)) throw new PersonExistsError();
    return this.toPerson(this.addPerson(userId, details));
  }

  async updatePerson(userId: string, personId: string, input: UpdatePersonInput): Promise<PersonUpdate> {
    const person = this.people.find((item) => item.id === personId && item.ownerId === userId);
    if (!person) throw new PersonNotFoundError();
    // Validate every field before changing any, like the single SQL update.
    const changes = cleanPersonChanges(userId, input, { allowLocalUri: true });
    if (changes.name !== undefined) {
      const namesake = this.findPersonByName(userId, changes.name);
      if (namesake && namesake.id !== person.id) throw new PersonExistsError();
    }
    if (changes.name !== undefined && changes.name !== person.name) {
      person.name = changes.name;
      // History shows the person's current name.
      for (const transaction of this.personalTransactions) {
        if (transaction.userId === userId && transaction.personId === person.id) transaction.counterparty = person.name;
      }
    }
    if (changes.email !== undefined) {
      if (changes.email) person.email = changes.email;
      else delete person.email;
    }
    if (changes.avatarPath !== undefined) {
      if (changes.avatarPath) person.avatarPath = changes.avatarPath;
      else delete person.avatarPath;
    }
    if (changes.emailUpdates !== undefined) person.emailUpdates = changes.emailUpdates;
    if (changes.reminderFrequency !== undefined) person.reminderFrequency = changes.reminderFrequency;
    // Adding or changing an address sends nothing: the owner sends a statement by hand.
    return this.toPerson(person);
  }

  async getExpense(userId: string, expenseId: string): Promise<ExpenseDetail> {
    const { expense, group } = this.requireExpense(userId, expenseId);
    const { createdByMemberId: _createdBy, ...detail } = expense;
    return { ...detail, ...this.expenseAccess(userId, expense, group) };
  }

  async updateExpense(userId: string, expenseId: string, input: UpdateExpenseInput, idempotencyKey: string): Promise<{ id: string }> {
    const key = `${userId}:${idempotencyKey}`;
    const cached = this.idempotency.get(key) as { id: string } | undefined;
    if (cached) return cached;
    const { expense, group } = this.requireExpense(userId, expenseId);
    if (!this.expenseAccess(userId, expense, group).canEdit) throw notAllowedToEditExpense();
    if (input.shares.some((share) => !group.members.some((member) => member.id === share.memberId))) {
      throw new ForbiddenError("Every expense participant must be a group member");
    }
    validateShares(input.amountMinor, input.splitMethod, input.shares);
    expense.eventName = input.eventName;
    expense.eventDate = input.eventDate;
    if (input.note) expense.note = input.note;
    else delete expense.note;
    expense.amountMinor = input.amountMinor;
    expense.splitMethod = input.splitMethod;
    expense.shares = input.shares;
    if (input.receiptUri !== undefined) {
      if (input.receiptUri) expense.receiptPath = input.receiptUri;
      else delete expense.receiptPath;
    }
    expense.editedAt = new Date().toISOString();
    const actor = this.users.get(userId)?.name ?? "Someone";
    this.activity.unshift({ id: randomUUID(), groupId: group.id, icon: "file-text", title: expense.eventName, detail: `${actor} edited this expense. It is now ${expense.amountMinor / 100} ${expense.currency}`, createdAt: expense.editedAt, tone: "neutral" });
    const result = { id: expense.id };
    this.idempotency.set(key, result);
    return result;
  }

  async deleteExpense(userId: string, expenseId: string): Promise<void> {
    const { expense, group } = this.requireExpense(userId, expenseId);
    if (!this.expenseAccess(userId, expense, group).canDelete) throw notAllowedToDeleteExpense();
    this.expenses.splice(this.expenses.indexOf(expense), 1);
    const actor = this.users.get(userId)?.name ?? "Someone";
    this.activity.unshift({ id: randomUUID(), groupId: group.id, icon: "file-text", title: expense.eventName, detail: `${actor} deleted this expense. It was ${expense.amountMinor / 100} ${expense.currency}`, createdAt: new Date().toISOString(), tone: "warning" });
  }

  async updatePersonalTransaction(userId: string, transactionId: string, input: UpdatePersonalTransactionInput): Promise<{ id: string }> {
    const entry = this.personalTransactions.find((item) => item.id === transactionId && item.userId === userId);
    if (!entry) throw entryNotFound();
    if (input.amountMinor <= 0) throw invalidAmount();
    const currency = input.currency.toUpperCase();
    const paid = entry.settledAmountMinor ?? 0;
    if (paid > 0) {
      if (input.direction !== entry.direction || currency !== entry.currency) throw entryHasPayments();
      if (entry.status === "settled" && input.amountMinor !== entry.amountMinor) throw entrySettled();
      if (entry.status !== "settled" && input.amountMinor <= paid) throw amountBelowPaid();
    }
    let person: StoredPerson;
    if (input.personId) {
      const owned = this.people.find((item) => item.id === input.personId && item.ownerId === userId);
      if (!owned) throw new PersonNotFoundError();
      person = owned;
    } else {
      if (!input.counterparty.trim()) throw new DomainError("Choose who this amount is with");
      person = this.findPersonByName(userId, input.counterparty) ?? this.addPerson(userId, { name: cleanPersonName(input.counterparty), email: null, avatarPath: null });
    }
    entry.title = input.title.trim();
    entry.eventDate = input.eventDate;
    entry.amountMinor = input.amountMinor;
    entry.currency = currency;
    entry.kind = input.kind;
    entry.direction = input.direction;
    entry.counterparty = person.name;
    entry.personId = person.id;
    if (input.note?.trim()) entry.note = input.note.trim();
    else delete entry.note;
    if (input.receiptUri !== undefined) {
      if (input.receiptUri) entry.receiptUri = input.receiptUri;
      else delete entry.receiptUri;
    }
    return { id: entry.id };
  }

  async deletePersonalTransaction(userId: string, transactionId: string): Promise<void> {
    const index = this.personalTransactions.findIndex((item) => item.id === transactionId && item.userId === userId);
    if (index < 0) throw entryNotFound();
    this.personalTransactions.splice(index, 1);
  }

  async inviteMember(userId: string, groupId: string, email: string): Promise<InviteLink> {
    const group = this.groups.get(groupId);
    if (!group || !group.members.some((member) => member.id === userId)) throw toGroupError("group_not_found");
    const address = email.trim().toLowerCase();
    if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw toGroupError("invalid_email");
    if (group.members.some((member) => member.email.toLowerCase() === address)) throw toGroupError("already_member");
    const now = Date.now();
    if (this.invitations.some((item) => item.groupId === groupId && item.email === address && !item.accepted && !item.revoked && Date.parse(item.expiresAt) > now && now - Date.parse(item.createdAt) < 12 * 3600 * 1000)) throw toGroupError("already_invited");
    if (this.invitations.filter((item) => item.invitedBy === userId && now - Date.parse(item.createdAt) < 24 * 3600 * 1000).length >= 30) throw toGroupError("invite_limit_reached");
    const link = await this.createInvite(userId, groupId, address);
    this.invitations.push({ id: randomUUID(), groupId, email: address, invitedBy: userId, token: link.url.split("/").pop() ?? "", createdAt: new Date(now).toISOString(), expiresAt: link.expiresAt });
    return link;
  }

  private openInvitationsFor(address: string) {
    const now = Date.now();
    return this.invitations.filter((item) => item.email === address && !item.accepted && !item.revoked && Date.parse(item.expiresAt) > now && this.groups.has(item.groupId));
  }

  async listInvitations(userId: string): Promise<Invitation[]> {
    const me = this.users.get(userId);
    if (!me) throw toGroupError("profile_not_found");
    return this.openInvitationsFor(me.email.toLowerCase())
      .filter((item) => !this.groups.get(item.groupId)!.members.some((member) => member.id === userId))
      .map((item) => ({ id: item.id, groupId: item.groupId, groupName: this.groups.get(item.groupId)!.name, invitedBy: this.users.get(item.invitedBy)?.name ?? "Someone", createdAt: item.createdAt, expiresAt: item.expiresAt }))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async acceptInvitation(userId: string, invitationId: string): Promise<Group> {
    const me = this.users.get(userId);
    if (!me) throw toGroupError("profile_not_found");
    const item = this.openInvitationsFor(me.email.toLowerCase()).find((candidate) => candidate.id === invitationId);
    if (!item) throw toGroupError("invitation_not_found");
    const group = this.groups.get(item.groupId)!;
    if (!group.members.some((member) => member.id === userId)) group.members.push(me);
    item.accepted = true;
    const invite = this.invites.get(item.token);
    if (invite) invite.accepted = true;
    this.activity.unshift({ id: randomUUID(), groupId: group.id, icon: "users", title: `${me.name} joined ${group.name}`, detail: `${group.members.length} members`, createdAt: new Date().toISOString(), tone: "positive" });
    return this.getGroup(userId, group.id);
  }

  async declineInvitation(userId: string, invitationId: string): Promise<void> {
    const me = this.users.get(userId);
    if (!me) throw toGroupError("profile_not_found");
    const item = this.openInvitationsFor(me.email.toLowerCase()).find((candidate) => candidate.id === invitationId);
    if (!item) throw toGroupError("invitation_not_found");
    item.revoked = true;
  }

  /** What `debtor` owes `creditor` in a group, like private.pair_balance: negative when it is the other way round. */
  private pairOwed(groupId: string, creditor: string, debtor: string) {
    return (this.getPairwiseDebts(groupId).get(pairKey(debtor, creditor)) ?? 0) - (this.getPairwiseDebts(groupId).get(pairKey(creditor, debtor)) ?? 0);
  }

  /** Settled and nothing waiting for review, like private.member_is_settled. */
  private memberIsSettled(groupId: string, memberId: string) {
    return this.getGroupBalance(groupId, memberId) === 0
      && !this.settlements.some((settlement) => settlement.groupId === groupId && settlement.status === "awaiting_review" && (settlement.debtor.id === memberId || settlement.recipient.id === memberId));
  }

  async getGroupPeople(userId: string, groupId: string): Promise<GroupPeople> {
    const group = this.groups.get(groupId);
    if (!group || !group.members.some((member) => member.id === userId)) throw toGroupError("group_not_found");
    const owner = group.members[0]?.id;
    return {
      canManage: owner === userId,
      members: group.members.map((member) => ({
        id: member.id,
        name: member.name,
        ...(member.avatarUrl ? { avatarUrl: member.avatarUrl } : {}),
        role: member.id === owner ? "owner" as const : "member" as const,
        settled: this.memberIsSettled(groupId, member.id),
        owesYouMinor: member.id === userId ? 0 : this.pairOwed(groupId, userId, member.id),
        joinedAt: member.createdAt ?? new Date(0).toISOString(),
      })),
      invitations: this.invitations
        .filter((item) => item.groupId === groupId && !item.accepted && !item.revoked && Date.parse(item.expiresAt) > Date.now() && !group.members.some((member) => member.email.toLowerCase() === item.email))
        .map((item) => ({ id: item.id, email: item.email, invitedBy: this.users.get(item.invitedBy)?.name ?? "Someone", createdAt: item.createdAt, expiresAt: item.expiresAt })),
    };
  }

  async leaveGroup(userId: string, groupId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group || !group.members.some((member) => member.id === userId)) throw toGroupError("group_not_found");
    if (group.members[0]?.id === userId && group.members.length > 1) throw toGroupError("owner_cannot_leave");
    if (!this.memberIsSettled(groupId, userId)) throw toGroupError("not_settled");
    const name = this.users.get(userId)?.name ?? "Someone";
    group.members = group.members.filter((member) => member.id !== userId);
    if (group.members.length === 0) this.groups.delete(groupId);
    else this.activity.unshift({ id: randomUUID(), groupId, icon: "users", title: `${name} left ${group.name}`, detail: `${group.members.length} members`, createdAt: new Date().toISOString(), tone: "neutral" });
  }

  async removeMember(userId: string, groupId: string, memberId: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group || !group.members.some((member) => member.id === userId)) throw toGroupError("group_not_found");
    if (group.members[0]?.id !== userId) throw toGroupError("not_allowed");
    if (memberId === userId) throw toGroupError("use_leave");
    const target = group.members.find((member) => member.id === memberId);
    if (!target) throw toGroupError("member_not_found");
    if (!this.memberIsSettled(groupId, memberId)) throw toGroupError("not_settled");
    group.members = group.members.filter((member) => member.id !== memberId);
    this.activity.unshift({ id: randomUUID(), groupId, icon: "users", title: `${target.name} was removed from ${group.name}`, detail: `${group.members.length} members`, createdAt: new Date().toISOString(), tone: "warning" });
  }

  async renameGroup(userId: string, groupId: string, name: string): Promise<void> {
    const group = this.groups.get(groupId);
    if (!group || !group.members.some((member) => member.id === userId)) throw toGroupError("group_not_found");
    if (group.members[0]?.id !== userId) throw toGroupError("not_allowed");
    const next = name.trim();
    if (next.length < 2 || next.length > 80) throw toGroupError("invalid_group_name");
    if (next === group.name) return;
    const previous = group.name;
    group.name = next;
    this.activity.unshift({ id: randomUUID(), groupId, icon: "users", title: next, detail: `Renamed from ${previous}`, createdAt: new Date().toISOString(), tone: "neutral" });
  }

  private tokensOf(userId: string) {
    return this.pushTokens.filter((item) => item.userId === userId).sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt)).map((item) => item.token);
  }

  async registerPushToken(userId: string, token: string, platform: PushPlatform): Promise<void> {
    if (!this.users.get(userId)) throw toPushError("profile_not_found");
    if (!["android", "ios", "web"].includes(platform)) throw toPushError("invalid_platform");
    if (token.length < 20 || token.length > 4096) throw toPushError("invalid_token");
    const now = this.now().toISOString();
    const existing = this.pushTokens.find((item) => item.token === token);
    if (existing) Object.assign(existing, { userId, platform, lastSeenAt: now });
    else this.pushTokens.push({ userId, token, platform, createdAt: now, lastSeenAt: now });
    // The token just registered stays; of the person's other phones the nine most recently seen stay with it.
    const keep = new Set(this.pushTokens.filter((item) => item.userId === userId && item.token !== token).sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt)).slice(0, 9).map((item) => item.token));
    this.pushTokens = this.pushTokens.filter((item) => item.userId !== userId || item.token === token || keep.has(item.token));
  }

  async removePushToken(userId: string, token: string): Promise<void> {
    this.pushTokens = this.pushTokens.filter((item) => !(item.userId === userId && item.token === token));
  }

  async dropPushTokens(tokens: string[]): Promise<void> {
    this.pushTokens = this.pushTokens.filter((item) => !tokens.includes(item.token));
  }

  async createNudge(userId: string, groupId: string, memberId: string): Promise<NudgeDelivery> {
    const group = this.groups.get(groupId);
    if (!group || !group.members.some((member) => member.id === userId)) throw toPushError("group_not_found");
    if (memberId === userId) throw toPushError("cannot_nudge_yourself");
    const recipient = group.members.find((member) => member.id === memberId);
    if (!recipient) throw toPushError("member_not_found");
    const owed = this.pairOwed(groupId, userId, memberId);
    if (owed <= 0) throw toPushError("nothing_owed");
    const now = this.now().getTime();
    const dayAgo = now - 24 * 3600 * 1000;
    if (this.nudges.some((item) => item.senderId === userId && item.recipientId === memberId && item.groupId === groupId && Date.parse(item.createdAt) > dayAgo)) throw toPushError("nudge_cooldown");
    if (this.nudges.filter((item) => item.senderId === userId && Date.parse(item.createdAt) > dayAgo).length >= 15) throw toPushError("nudge_limit_reached");
    const tokens = this.tokensOf(memberId);
    let nudgeId: string | null = null;
    if (tokens.length > 0) {
      nudgeId = randomUUID();
      this.nudges.push({ id: nudgeId, groupId, senderId: userId, recipientId: memberId, createdAt: new Date(now).toISOString() });
    }
    return {
      nudgeId, senderName: this.users.get(userId)?.name ?? "Someone", recipientName: recipient.name, amountMinor: owed,
      currency: group.currency, groupId, groupName: group.name, tokens,
    };
  }

  async undoNudge(userId: string, nudgeId: string): Promise<void> {
    const index = this.nudges.findIndex((item) => item.id === nudgeId && item.senderId === userId);
    if (index >= 0) this.nudges.splice(index, 1);
  }

  async getInvitationPushTarget(userId: string, groupId: string, email: string): Promise<InvitationPushTarget | null> {
    const group = this.groups.get(groupId);
    if (!group || !group.members.some((member) => member.id === userId)) return null;
    const address = email.trim().toLowerCase();
    const fresh = this.invitations.some((item) => item.groupId === groupId && item.invitedBy === userId && item.email === address && !item.accepted && !item.revoked && this.now().getTime() - Date.parse(item.createdAt) < 5 * 60 * 1000);
    if (!fresh) return null;
    const target = Array.from(this.users.values()).find((user) => user.email.toLowerCase() === address);
    if (!target || group.members.some((member) => member.id === target.id)) return null;
    const tokens = this.tokensOf(target.id);
    if (tokens.length === 0) return null;
    return { tokens, inviterName: this.users.get(userId)?.name ?? "Someone", groupName: group.name, groupId };
  }

  /** Same rules as app_get_payment_push_target (202611180017): the step is the caller's and just happened, once, not flooded. */
  async getPaymentPushTarget(userId: string, settlementId: string, event: PaymentPushEvent): Promise<PaymentPushTarget | null> {
    const settlement = this.settlements.find((item) => item.id === settlementId);
    if (!settlement) return null;
    let recipientId: string;
    if (event === "claimed") {
      // createSettlement stamps real time, so freshness is measured against it too.
      if (settlement.debtor.id !== userId || settlement.status !== "awaiting_review" || Date.now() - Date.parse(settlement.createdAt) > 10 * 60 * 1000) return null;
      const hourAgo = Date.now() - 3600 * 1000;
      const recent = this.settlements.filter((item) => item.debtor.id === settlement.debtor.id && item.recipient.id === settlement.recipient.id && Date.parse(item.createdAt) > hourAgo).length;
      if (recent > 5) return null;
      recipientId = settlement.recipient.id;
    } else if (event === "confirmed" || event === "needs_attention") {
      if (settlement.recipient.id !== userId || settlement.status !== event) return null;
      if (event === "confirmed" && settlement.confirmationMethod !== "recipient_review") return null;
      recipientId = settlement.debtor.id;
    } else {
      if (settlement.debtor.id !== userId || settlement.status !== "confirmed" || settlement.confirmationMethod !== "claimant_fallback") return null;
      recipientId = settlement.recipient.id;
    }
    const tokens = this.tokensOf(recipientId);
    if (tokens.length === 0) return null;
    const key = `${settlementId}:${event}`;
    if (this.paymentPushes.has(key)) return null;
    this.paymentPushes.add(key);
    return {
      tokens, event, actorName: this.users.get(userId)?.name ?? "Someone", amountMinor: settlement.amountMinor, currency: settlement.currency,
      groupId: settlement.groupId, groupName: this.groups.get(settlement.groupId)?.name ?? "your group", settlementId,
    };
  }

  async checkHealth(): Promise<DatabaseHealth> {
    return { missing: [] };
  }

  async exportData(userId: string): Promise<ExportDocument> {
    const me = this.users.get(userId);
    if (!me) throw new NotFoundError("Profile not found");
    const nameOf = (id: string) => this.users.get(id)?.name ?? "Deleted user";
    const myGroups = Array.from(this.groups.values()).filter((group) => group.members.some((member) => member.id === userId));
    const myGroupIds = new Set(myGroups.map((group) => group.id));
    const groupName = (id: string) => this.groups.get(id)?.name ?? "Group";
    const myPeople = this.people.filter((person) => person.ownerId === userId);
    return {
      format: "lenadena-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      account: { name: me.name, email: me.email, createdAt: me.createdAt ?? new Date(0).toISOString() },
      groups: myGroups.map((group) => ({
        name: group.name,
        currency: group.currency,
        role: group.members[0]?.id === userId ? "owner" : "member",
        joinedAt: me.createdAt ?? new Date(0).toISOString(),
        archived: false,
        members: group.members.map((member) => ({ name: member.name })),
      })),
      expenses: this.expenses
        .filter((expense) => myGroupIds.has(expense.groupId) && (expense.paidByMemberId === userId || expense.shares.some((share) => share.memberId === userId)))
        .map((expense) => ({
          group: groupName(expense.groupId),
          title: expense.eventName,
          date: expense.eventDate,
          amountMinor: expense.amountMinor,
          currency: expense.currency,
          paidBy: nameOf(expense.paidByMemberId),
          paidByMe: expense.paidByMemberId === userId,
          splitMethod: expense.splitMethod,
          ...(expense.note ? { note: expense.note } : {}),
          hasReceipt: Boolean(expense.receiptPath),
          createdAt: expense.createdAt,
          ...(expense.editedAt ? { editedAt: expense.editedAt } : {}),
          shares: expense.shares.map((share) => ({
            person: nameOf(share.memberId),
            isMe: share.memberId === userId,
            amountMinor: share.amountMinor,
            ...(share.percentageBasisPoints !== undefined ? { percentageBasisPoints: share.percentageBasisPoints } : {}),
          })),
        })),
      payments: this.settlements
        .filter((settlement) => settlement.debtor.id === userId || settlement.recipient.id === userId)
        .map((settlement) => ({
          group: groupName(settlement.groupId),
          from: settlement.debtor.name,
          to: settlement.recipient.name,
          fromMe: settlement.debtor.id === userId,
          amountMinor: settlement.amountMinor,
          currency: settlement.currency,
          status: settlement.status,
          ...(settlement.note ? { note: settlement.note } : {}),
          hasProof: Boolean(settlement.proofUri),
          ...(settlement.confirmationMethod ? { confirmationMethod: settlement.confirmationMethod } : {}),
          createdAt: settlement.createdAt,
        })),
      individualBalances: this.personalTransactions
        .filter((entry) => entry.userId === userId)
        .map((entry) => ({
          title: entry.title,
          date: entry.eventDate,
          person: entry.counterparty ?? "",
          kind: entry.kind,
          direction: entry.direction,
          amountMinor: entry.amountMinor,
          currency: entry.currency,
          paidMinor: entry.settledAmountMinor ?? 0,
          status: entry.status ?? "open",
          ...(entry.settledAt ? { settledAt: entry.settledAt } : {}),
          ...(entry.note ? { note: entry.note } : {}),
          hasReceipt: Boolean(entry.receiptUri),
          createdAt: entry.createdAt,
        })),
      people: myPeople.map((person) => ({
        name: person.name,
        ...(person.email ? { email: person.email } : {}),
        reminders: person.reminderFrequency ?? "off",
        hasPhoto: Boolean(person.avatarPath),
        createdAt: person.createdAt,
      })),
      activity: this.activity
        .filter((item) => myGroupIds.has(item.groupId))
        .map((item) => ({ group: groupName(item.groupId), kind: item.icon, title: item.title, detail: item.detail, createdAt: item.createdAt })),
      emails: this.personEmails
        .filter((email) => email.ownerId === userId)
        .map((email) => ({ type: email.kind, to: email.email, createdAt: email.queuedAt })),
      notificationDevices: this.pushTokens
        .filter((item) => item.userId === userId)
        .map((item) => ({ platform: item.platform, registeredAt: item.createdAt })),
    };
  }

  async deleteAccount(userId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    // Demo mode keeps shared groups in memory, so this only does the private half: their entries, saved people and
    // queued emails go, and what other records point at becomes "Deleted user".
    for (let index = this.personalTransactions.length - 1; index >= 0; index -= 1) {
      if (this.personalTransactions[index]?.userId === userId) this.personalTransactions.splice(index, 1);
    }
    for (let index = this.people.length - 1; index >= 0; index -= 1) {
      if (this.people[index]?.ownerId === userId) this.people.splice(index, 1);
    }
    for (let index = this.personEmails.length - 1; index >= 0; index -= 1) {
      if (this.personEmails[index]?.ownerId === userId) this.personEmails.splice(index, 1);
    }
    for (let index = this.personInvites.length - 1; index >= 0; index -= 1) {
      if (this.personInvites[index]?.ownerId === userId) this.personInvites.splice(index, 1);
    }
    this.pushTokens = this.pushTokens.filter((item) => item.userId !== userId);
    for (let index = this.nudges.length - 1; index >= 0; index -= 1) {
      if (this.nudges[index]?.senderId === userId || this.nudges[index]?.recipientId === userId) this.nudges.splice(index, 1);
    }
    this.users.set(userId, { id: userId, name: "Deleted user", email: "" });
    this.lastSeenAt.delete(userId);
  }

  async deletePerson(userId: string, personId: string): Promise<void> {
    const index = this.people.findIndex((item) => item.id === personId && item.ownerId === userId);
    if (index < 0) throw new PersonNotFoundError();
    this.people.splice(index, 1);
    // Their entries stay in the ledger under the same counterparty text; only the link goes.
    for (const transaction of this.personalTransactions) {
      if (transaction.personId === personId) delete transaction.personId;
    }
  }

  async invitePerson(userId: string, personId: string, downloadUrl: string | null): Promise<{ queuedAt: string }> {
    const inviter = this.users.get(userId);
    if (!inviter) throw new NotFoundError("Profile not found");
    const person = this.people.find((item) => item.id === personId && item.ownerId === userId);
    if (!person) throw new PersonNotFoundError();
    if (!person.email) throw new PersonHasNoEmailError();
    const now = this.now();
    const since = now.getTime() - PERSON_INVITE_COOLDOWN_MS;
    const recent = this.personInvites.some((invite) =>
      Date.parse(invite.queuedAt) > since && (invite.personId === person.id || (invite.ownerId === userId && invite.email === person.email)));
    if (recent) throw new InviteRecentlySentError();
    const invite: QueuedPersonInvite = {
      ownerId: userId,
      personId: person.id,
      personName: person.name,
      inviterName: inviter.name,
      email: person.email,
      downloadUrl,
      queuedAt: now.toISOString(),
    };
    this.personInvites.push(invite);
    return { queuedAt: invite.queuedAt };
  }

  async emailPerson(userId: string, personId: string): Promise<{ queuedAt: string }> {
    if (!this.users.has(userId)) throw new NotFoundError("Profile not found");
    const person = this.people.find((item) => item.id === personId && item.ownerId === userId);
    if (!person) throw new PersonNotFoundError();
    if (!person.email) throw new PersonHasNoEmailError();
    this.assertWithinDailyLimit(userId);
    const now = this.now();
    const recent = this.personEmails.some((email) => email.kind === "statement" && email.personId === person.id && Date.parse(email.queuedAt) > now.getTime() - STATEMENT_COOLDOWN_MS);
    if (recent) throw new EmailRecentlySentError();
    if (!this.entriesWith(userId, person.id).length) throw new PersonHasNoEntriesError();
    return { queuedAt: this.queueEmail(userId, person, "statement", [], 0).queuedAt };
  }

  /** Emails queued so far (demo mode sends none). For tests. */
  queuedEmails(): readonly QueuedPersonEmail[] {
    return this.personEmails;
  }

  /** Invites queued so far (demo mode sends no email). For tests. */
  queuedInvites(): readonly QueuedPersonInvite[] {
    return this.personInvites;
  }

  async createSettlement(userId: string, input: CreateSettlementInput, idempotencyKey: string): Promise<{ id: string }> {
    const key = `${userId}:${idempotencyKey}`;
    const cached = this.idempotency.get(key) as { id: string } | undefined;
    if (cached) return cached;
    const group = this.requireMembership(userId, input.groupId);
    const debtor = this.users.get(userId);
    const recipient = group.members.find((member) => member.id === input.recipientMemberId);
    if (!debtor || !recipient || recipient.id === debtor.id) {
      throw new DomainError("Choose another group member as recipient");
    }
    const pendingAmount = this.settlements
      .filter((item) => item.groupId === group.id && item.debtor.id === debtor.id && item.recipient.id === recipient.id && item.status === "awaiting_review")
      .reduce((sum, item) => sum + item.amountMinor, 0);
    const openAmount = Math.max(0, (this.getPairwiseDebts(group.id).get(pairKey(debtor.id, recipient.id)) ?? 0) - pendingAmount);
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor > openAmount) {
      throw new ConflictError(`Payment claim cannot exceed the open amount of ${openAmount} minor units`);
    }
    const settlement: Settlement = {
      id: randomUUID(),
      groupId: group.id,
      debtor,
      recipient,
      amountMinor: input.amountMinor,
      currency: group.currency,
      status: "awaiting_review",
      ...(input.proofUri ? { proofUri: input.proofUri } : {}),
      ...(input.note ? { note: input.note } : {}),
      createdAt: new Date().toISOString(),
    };
    this.settlements.unshift(settlement);
    const result = { id: settlement.id };
    this.idempotency.set(key, result);
    this.activity.unshift({ id: randomUUID(), groupId: group.id, icon: "send", title: `${debtor.name} says they paid`, detail: `${(input.amountMinor / 100).toFixed(2)} ${group.currency}`, createdAt: settlement.createdAt, tone: "warning" });
    return result;
  }

  async reviewSettlement(userId: string, settlementId: string, decision: Extract<SettlementStatus, "confirmed" | "needs_attention">, note: string | undefined, idempotencyKey: string): Promise<void> {
    const key = `${userId}:${idempotencyKey}`;
    if (this.idempotency.has(key)) return;
    const settlement = this.settlements.find((item) => item.id === settlementId);
    if (!settlement) throw new NotFoundError("Settlement not found");
    if (settlement.recipient.id !== userId) throw new ForbiddenError("Only the intended recipient can review this payment");
    if (settlement.status !== "awaiting_review") throw new ConflictError("This payment has already been reviewed");
    settlement.status = decision;
    if (note) settlement.note = note;
    if (decision === "confirmed") settlement.confirmationMethod = "recipient_review";
    this.idempotency.set(key, true);
    this.activity.unshift({
      id: randomUUID(),
      groupId: settlement.groupId,
      icon: decision === "confirmed" ? "check-circle" : "alert-circle",
      title: decision === "confirmed" ? "Payment confirmed" : "Payment needs attention",
      detail: `${(settlement.amountMinor / 100).toFixed(2)} ${settlement.currency}`,
      createdAt: new Date().toISOString(),
      tone: decision === "confirmed" ? "positive" : "warning",
    });
  }

  async selfConfirmSettlement(userId: string, settlementId: string, idempotencyKey: string): Promise<void> {
    const key = `${userId}:${idempotencyKey}`;
    if (this.idempotency.has(key)) return;
    const settlement = this.settlements.find((item) => item.id === settlementId);
    if (!settlement) throw new NotFoundError("Settlement not found");
    if (settlement.debtor.id !== userId) throw new ForbiddenError("Only the payer can use fallback settlement");
    if (settlement.status !== "awaiting_review") throw new ConflictError("This payment has already been resolved");
    const recipientHasOpenedApp = this.lastSeenAt.has(settlement.recipient.id);
    const availableAt = recipientHasOpenedApp ? Date.parse(settlement.createdAt) + 72 * 60 * 60 * 1000 : Date.parse(settlement.createdAt);
    if (Date.now() < availableAt) throw new ConflictError(`Recipient review is available until ${new Date(availableAt).toISOString()}`);
    settlement.status = "confirmed";
    settlement.confirmationMethod = "claimant_fallback";
    settlement.note = settlement.note ? `${settlement.note} · Marked settled by payer` : "Marked settled by payer";
    this.idempotency.set(key, true);
    this.activity.unshift({
      id: randomUUID(),
      groupId: settlement.groupId,
      icon: "check-circle",
      title: "Payment marked settled by payer",
      detail: `${(settlement.amountMinor / 100).toFixed(2)} ${settlement.currency}`,
      createdAt: new Date().toISOString(),
      tone: "warning",
    });
  }

  async storeImage(_userId: string, _kind: UploadKind, _contentType: string, _bytes: Buffer): Promise<{ path: string }> {
    throw new DomainError("Private uploads require Supabase mode", 501, "upload_unavailable");
  }

  async createInvite(userId: string, groupId: string, email: string | undefined): Promise<InviteLink> {
    this.requireMembership(userId, groupId);
    const token = `${randomUUID()}${randomUUID().replaceAll("-", "")}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    this.invites.set(token, { groupId, ...(email ? { email: email.toLowerCase() } : {}), expiresAt, accepted: false });
    return { url: `lenadena://invite/${token}`, expiresAt };
  }

  async acceptInvite(userId: string, token: string): Promise<Group> {
    const invite = this.invites.get(token);
    if (!invite || invite.accepted || Date.parse(invite.expiresAt) <= Date.now()) throw new NotFoundError("Invite is invalid or expired");
    let user = this.users.get(userId);
    if (!user) {
      user = { id: userId, name: invite.email?.split("@")[0] || "Friend", email: invite.email ?? `${userId}@demo.local` };
      this.users.set(userId, user);
    }
    if (invite.email && invite.email !== user.email.toLowerCase()) throw new ForbiddenError("This invite was sent to another email address");
    const group = this.groups.get(invite.groupId);
    if (!group) throw new NotFoundError("Group not found");
    if (!group.members.some((member) => member.id === userId)) group.members.push(user);
    invite.accepted = true;
    this.activity.unshift({ id: randomUUID(), groupId: group.id, icon: "users", title: `${user.name} joined ${group.name}`, detail: `${group.members.length} members`, createdAt: new Date().toISOString(), tone: "positive" });
    return this.getGroup(userId, group.id);
  }

  private listPeople(userId: string): Person[] {
    return this.people
      .filter((person) => person.ownerId === userId)
      .sort((left, right) => personNameKey(left.name).localeCompare(personNameKey(right.name)) || left.id.localeCompare(right.id))
      .map((person) => this.toPerson(person));
  }

  private entriesWith(userId: string, personId: string) {
    return this.personalTransactions.filter((item) => item.userId === userId && item.personId === personId);
  }

  private assertWithinDailyLimit(userId: string) {
    const since = this.now().getTime() - 24 * 60 * 60 * 1000;
    const sent = this.personEmails.filter((email) => email.ownerId === userId && Date.parse(email.queuedAt) > since).length;
    if (sent >= DAILY_PERSON_EMAIL_LIMIT) throw new EmailLimitReachedError();
  }

  private queueEmail(userId: string, person: StoredPerson, kind: QueuedPersonEmail["kind"], transactionIds: string[], delayMs: number): QueuedPersonEmail {
    const now = this.now();
    const email: QueuedPersonEmail = {
      ownerId: userId,
      personId: person.id,
      personName: person.name,
      email: person.email ?? "",
      kind,
      transactionIds,
      queuedAt: now.toISOString(),
      availableAt: new Date(now.getTime() + delayMs).toISOString(),
    };
    this.personEmails.push(email);
    return email;
  }

  private findPersonByName(userId: string, name: string) {
    const key = personNameKey(name);
    return this.people.find((person) => person.ownerId === userId && personNameKey(person.name) === key);
  }

  /** Adds a person and links the owner's unlinked entries that already use this name. */
  private addPerson(userId: string, details: { name: string; email: string | null; avatarPath: string | null }) {
    const person: StoredPerson = {
      id: randomUUID(),
      ownerId: userId,
      name: details.name,
      ...(details.email ? { email: details.email } : {}),
      ...(details.avatarPath ? { avatarPath: details.avatarPath } : {}),
      emailUpdates: true,
      reminderFrequency: "off",
      createdAt: new Date().toISOString(),
    };
    this.people.push(person);
    const key = personNameKey(person.name);
    for (const transaction of this.personalTransactions) {
      if (transaction.userId === userId && !transaction.personId && personNameKey(transaction.counterparty ?? "") === key) {
        transaction.personId = person.id;
        transaction.counterparty = person.name;
      }
    }
    return person;
  }

  /** Demo mode has no storage to sign from, so the photo URL is the stored local URI, as for profile photos. */
  private toPerson({ ownerId: _ownerId, ...person }: StoredPerson): Person {
    return person.avatarPath ? { ...person, avatarUrl: person.avatarPath } : { ...person };
  }

  /** Whoever added or paid an expense may edit it; they and the group's owner may delete it. */
  private expenseAccess(userId: string, expense: StoredExpense, group: StoredGroup) {
    const mine = expense.paidByMemberId === userId || (expense.createdByMemberId ?? expense.paidByMemberId) === userId;
    const owner = group.members[0]?.id === userId;
    return { canEdit: mine, canDelete: mine || owner };
  }

  /** An expense the caller can see; one in a group they are not in is "not found", like the database. */
  private requireExpense(userId: string, expenseId: string) {
    const expense = this.expenses.find((item) => item.id === expenseId);
    const group = expense ? this.groups.get(expense.groupId) : undefined;
    if (!expense || !group || !group.members.some((member) => member.id === userId)) throw expenseNotFound();
    return { expense, group };
  }

  private requireMembership(userId: string, groupId: string) {
    const group = this.groups.get(groupId);
    if (!group) throw new NotFoundError("Group not found");
    if (!group.members.some((member) => member.id === userId)) throw new ForbiddenError("You are not a member of this group");
    return group;
  }

  private getGroupBalance(groupId: string, userId: string) {
    const pairwise = this.getPairwiseDebts(groupId);
    let balance = 0;
    for (const [key, amount] of pairwise) {
      const [debtorId, recipientId] = key.split(":");
      if (debtorId === userId) balance -= amount;
      if (recipientId === userId) balance += amount;
    }
    return balance;
  }

  private getPairwiseDebts(groupId: string) {
    const debts = new Map<string, number>();
    for (const expense of this.expenses.filter((item) => item.groupId === groupId)) {
      for (const share of expense.shares) {
        if (share.memberId === expense.paidByMemberId) continue;
        const key = pairKey(share.memberId, expense.paidByMemberId);
        debts.set(key, (debts.get(key) ?? 0) + share.amountMinor);
      }
    }
    for (const settlement of this.settlements.filter((item) => item.groupId === groupId && item.status === "confirmed")) {
      const key = pairKey(settlement.debtor.id, settlement.recipient.id);
      debts.set(key, Math.max(0, (debts.get(key) ?? 0) - settlement.amountMinor));
    }
    return debts;
  }
}

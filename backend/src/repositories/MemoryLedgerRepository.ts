import { randomUUID } from "node:crypto";
import { ConflictError, DomainError, ForbiddenError, NotFoundError } from "../domain/errors.js";
import { pairKey, validateShares } from "../domain/money.js";
import type {
  ActivityItem,
  CreateExpenseInput,
  CreateGroupInput,
  CreatePersonalTransactionInput,
  CreateSettlementInput,
  Expense,
  Group,
  InviteLink,
  Member,
  Plan,
  Settlement,
  SettlementStatus,
  TransactionItem,
  UploadKind,
} from "../domain/types.js";
import type { LedgerRepository } from "./LedgerRepository.js";

type StoredGroup = Omit<Group, "balanceMinor">;
type StoredPersonalTransaction = TransactionItem & { userId: string };

const demoUser: Member = { id: "demo-user", name: "Huzaifa", email: "huzaifa@example.com" };
const sara: Member = { id: "sara", name: "Sara", email: "sara@example.com" };
const hamza: Member = { id: "hamza", name: "Hamza", email: "hamza@example.com" };

export class MemoryLedgerRepository implements LedgerRepository {
  private readonly users = new Map<string, Member>([
    [demoUser.id, demoUser],
    [sara.id, sara],
    [hamza.id, hamza],
  ]);
  private readonly groups = new Map<string, StoredGroup>([
    ["weekend-crew", { id: "weekend-crew", name: "Weekend crew", currency: "PKR", accent: "#35C4A5", role: "owner", members: [demoUser, sara, hamza] }],
    ["flat-bills", { id: "flat-bills", name: "Flat bills", currency: "PKR", accent: "#D79A31", role: "member", members: [demoUser, hamza] }],
  ]);
  private readonly expenses: Expense[] = [
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
    { id: "personal-1", userId: demoUser.id, source: "personal", title: "Coffee money", eventDate: "2026-09-13", amountMinor: 185000, currency: "PKR", direction: "outgoing", kind: "expense", counterparty: "Ali", status: "open", createdAt: "2026-09-13T08:20:00.000Z" },
    { id: "personal-2", userId: demoUser.id, source: "personal", title: "Camera loan", eventDate: "2026-09-08", amountMinor: 1200000, currency: "PKR", direction: "incoming", kind: "loan", counterparty: "Ali", status: "settled", settledAt: "2026-09-10T17:45:00.000Z", createdAt: "2026-09-08T17:45:00.000Z" },
  ];
  private readonly idempotency = new Map<string, unknown>();
  private readonly invites = new Map<string, { groupId: string; email?: string; expiresAt: string; accepted: boolean }>();

  async getPlan(userId: string): Promise<Plan> {
    const user = this.users.get(userId);
    if (!user) {
      throw new NotFoundError("Profile not found");
    }
    const groups = Array.from(this.groups.values())
      .filter((group) => group.members.some((member) => member.id === userId))
      .map((group) => ({ ...group, role: group.members[0]?.id === userId ? "owner" as const : "member" as const, balanceMinor: this.getGroupBalance(group.id, userId) }));
    const groupIds = new Set(groups.map((group) => group.id));
    const reviews = this.settlements.filter((settlement) => settlement.recipient.id === userId && settlement.status === "awaiting_review");
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
        title: "Payment completed",
        eventDate: settlement.createdAt.slice(0, 10),
        amountMinor: settlement.amountMinor,
        currency: settlement.currency,
        direction: settlement.recipient.id === userId ? "incoming" as const : "outgoing" as const,
        kind: "payment" as const,
        counterparty: settlement.recipient.id === userId ? settlement.debtor.name : settlement.recipient.name,
        createdAt: settlement.createdAt,
      }));
    const personalTransactions = this.personalTransactions
      .filter((transaction) => transaction.userId === userId)
      .map(({ userId: _userId, ...transaction }) => transaction);
    const transactions = [...personalTransactions, ...expenseTransactions, ...settlementTransactions]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const totals = Array.from(new Set(groups.map((group) => group.currency))).map((currency) => ({
      currency,
      oweMinor: groups.filter((group) => group.currency === currency).reduce((sum, group) => sum + Math.max(0, -group.balanceMinor), 0),
      owedMinor: groups.filter((group) => group.currency === currency).reduce((sum, group) => sum + Math.max(0, group.balanceMinor), 0),
    }));
    return { user, totals, groups, reviews, activity, transactions };
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
    const expense: Expense = {
      id: randomUUID(),
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

  async createPersonalTransaction(userId: string, input: CreatePersonalTransactionInput, idempotencyKey: string): Promise<{ id: string }> {
    const key = `${userId}:${idempotencyKey}`;
    const cached = this.idempotency.get(key) as { id: string } | undefined;
    if (cached) return cached;
    if (!this.users.has(userId)) throw new NotFoundError("Profile not found");
    if (!input.counterparty.trim()) throw new DomainError("Choose who this amount is with");
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
      counterparty: input.counterparty.trim(),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
      status: "open",
      createdAt: new Date().toISOString(),
    };
    this.personalTransactions.unshift(transaction);
    const result = { id: transaction.id };
    this.idempotency.set(key, result);
    return result;
  }

  async settlePersonalTransaction(userId: string, transactionId: string, idempotencyKey: string): Promise<void> {
    const key = `${userId}:${idempotencyKey}`;
    if (this.idempotency.has(key)) return;
    const transaction = this.personalTransactions.find((item) => item.id === transactionId && item.userId === userId);
    if (!transaction) throw new NotFoundError("Individual entry not found");
    if (transaction.status !== "settled") {
      transaction.status = "settled";
      transaction.settledAt = new Date().toISOString();
    }
    this.idempotency.set(key, true);
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

  async storeImage(_userId: string, _kind: UploadKind, _contentType: string, _bytes: Buffer): Promise<{ path: string }> {
    throw new DomainError("Private uploads require Supabase mode", 501, "upload_unavailable");
  }

  async createInvite(userId: string, groupId: string, email: string | undefined): Promise<InviteLink> {
    this.requireMembership(userId, groupId);
    const token = `${randomUUID()}${randomUUID().replaceAll("-", "")}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    this.invites.set(token, { groupId, ...(email ? { email: email.toLowerCase() } : {}), expiresAt, accepted: false });
    return { url: `oweyaar://invite/${token}`, expiresAt };
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

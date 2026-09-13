export type TabKey = "plan" | "groups" | "reviews" | "activity";

export type SplitMethod = "equal" | "exact" | "percentage";

export type TransactionKind = "expense" | "loan" | "payment";

export type TransactionDirection = "incoming" | "outgoing";

export type TransactionStatus = "open" | "settled";

export type SettlementStatus = "claimed" | "awaiting_review" | "confirmed" | "needs_attention";

export type Member = {
  id: string;
  name: string;
  email: string;
};

export type Group = {
  id: string;
  name: string;
  currency: string;
  accent: string;
  members: Member[];
  balanceMinor: number;
  role: "owner" | "admin" | "member";
};

export type ExpenseShare = {
  memberId: string;
  amountMinor: number;
  percentageBasisPoints?: number;
};

export type Expense = {
  id: string;
  groupId: string;
  eventName: string;
  eventDate: string;
  note?: string;
  amountMinor: number;
  currency: string;
  paidByMemberId: string;
  splitMethod: SplitMethod;
  shares: ExpenseShare[];
  receiptUri?: string;
  createdAt: string;
};

export type Settlement = {
  id: string;
  groupId: string;
  debtor: Member;
  recipient: Member;
  amountMinor: number;
  currency: string;
  status: SettlementStatus;
  proofUri?: string;
  note?: string;
  eventName?: string;
  eventDate?: string;
  createdAt: string;
};

export type ActivityItem = {
  id: string;
  icon: "file-text" | "send" | "check-circle" | "alert-circle" | "users";
  title: string;
  detail: string;
  createdAt: string;
  tone: "neutral" | "positive" | "warning";
};

export type TransactionItem = {
  id: string;
  source: "personal" | "group";
  groupId?: string;
  groupName?: string;
  title: string;
  eventDate: string;
  amountMinor: number;
  currency: string;
  direction: TransactionDirection;
  kind: TransactionKind;
  counterparty?: string;
  note?: string;
  status?: TransactionStatus;
  settledAt?: string;
  createdAt: string;
};

export type Plan = {
  user: Member;
  totals: Array<{ currency: string; oweMinor: number; owedMinor: number }>;
  groups: Group[];
  reviews: Settlement[];
  activity: ActivityItem[];
  transactions: TransactionItem[];
};

export type CreateExpenseInput = {
  groupId: string;
  eventName: string;
  eventDate: string;
  note?: string;
  amountMinor: number;
  paidByMemberId: string;
  splitMethod: SplitMethod;
  shares: ExpenseShare[];
  receiptUri?: string;
};

export type CreatePersonalTransactionInput = {
  title: string;
  eventDate: string;
  amountMinor: number;
  currency: string;
  kind: Extract<TransactionKind, "expense" | "loan">;
  direction: TransactionDirection;
  counterparty: string;
  note?: string;
};

export type CreateGroupInput = {
  name: string;
  currency: string;
  accent: string;
  inviteEmails: string[];
};

export type InviteLink = {
  url: string;
  expiresAt: string;
};

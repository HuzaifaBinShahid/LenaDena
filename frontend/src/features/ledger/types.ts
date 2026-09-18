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
  avatarUrl?: string;
  createdAt?: string;
};

/** Someone the user tracks individual balances with (not necessarily a LenaDena user). */
export type Person = {
  id: string;
  name: string;
  email?: string;
  /** Short-lived signed URL of their photo. */
  avatarUrl?: string;
  /** Storage path of their photo, kept so an edit can leave it unchanged. */
  avatarPath?: string;
  createdAt: string;
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
  recipientHasOpenedApp?: boolean;
  canSelfSettle?: boolean;
  selfSettleAvailableAt?: string;
  confirmationMethod?: "recipient_review" | "claimant_fallback";
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
  /** Set on personal rows linked to a saved person. */
  personId?: string;
  note?: string;
  receiptUri?: string;
  status?: TransactionStatus;
  settledAt?: string;
  createdAt: string;
};

export type Plan = {
  user: Member;
  totals: Array<{ currency: string; oweMinor: number; owedMinor: number }>;
  groups: Group[];
  reviews: Settlement[];
  claims: Settlement[];
  activity: ActivityItem[];
  transactions: TransactionItem[];
  people: Person[];
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
  /** Link to a saved person; without it the API finds or creates a person by `counterparty`. */
  personId?: string;
  note?: string;
  receiptUri?: string;
};

/** A new saved person. `avatarUri` is a local image; the LedgerProvider uploads it and sends the storage path. */
export type CreatePersonInput = {
  name: string;
  email?: string;
  avatarUri?: string;
};

/** An omitted field stays as it is; `null` clears the email or the photo. */
export type UpdatePersonInput = {
  name?: string;
  email?: string | null;
  avatarUri?: string | null;
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

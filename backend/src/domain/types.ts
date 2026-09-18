export type SplitMethod = "equal" | "exact" | "percentage";
export type SettlementStatus = "awaiting_review" | "confirmed" | "needs_attention";
export type UploadKind = "receipt" | "payment-proof" | "avatar";
export type TransactionKind = "expense" | "loan" | "payment";
export type TransactionDirection = "incoming" | "outgoing";
export type TransactionStatus = "open" | "settled";

export type InviteLink = {
  url: string;
  expiresAt: string;
};

export type Member = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  createdAt?: string;
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
  receiptPath?: string;
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
  groupId: string;
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
  /** Set on personal rows linked to one of the owner's people. */
  personId?: string;
  note?: string;
  receiptUri?: string;
  status?: TransactionStatus;
  settledAt?: string;
  createdAt: string;
};

/** Someone the owner keeps individual balances with. Private to the owner; never a LenaDena account. */
export type Person = {
  id: string;
  /** Trimmed, 1..80 characters, unique per owner case-insensitively. */
  name: string;
  /** Trimmed and lowercased. */
  email?: string;
  /** Short-lived signed URL for the photo in the private `avatars` bucket. */
  avatarUrl?: string;
  /** Storage path of the photo, so a client can keep it when editing. */
  avatarPath?: string;
  createdAt: string;
};

export type Plan = {
  user: Member;
  totals: Array<{ currency: string; oweMinor: number; owedMinor: number }>;
  groups: Group[];
  reviews: Settlement[];
  claims: Settlement[];
  activity: Omit<ActivityItem, "groupId">[];
  transactions: TransactionItem[];
  /** Sorted by name, case-insensitively. */
  people: Person[];
};

export type CreateGroupInput = {
  name: string;
  currency: string;
  accent: string;
  inviteEmails: string[];
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
  /** Links the entry to this person; their current name replaces `counterparty`. */
  personId?: string;
  note?: string;
  receiptUri?: string;
};

export type CreateSettlementInput = {
  groupId: string;
  recipientMemberId: string;
  amountMinor: number;
  note?: string;
  proofUri?: string;
};

export type UpdateProfileInput = {
  name: string;
  avatarPath?: string | null;
};

/** A blank or null email or photo means none. */
export type CreatePersonInput = {
  name: string;
  email?: string | null;
  avatarPath?: string | null;
};

/** An omitted field stays as it is; `null` clears the email or photo. */
export type UpdatePersonInput = {
  name?: string;
  email?: string | null;
  avatarPath?: string | null;
};

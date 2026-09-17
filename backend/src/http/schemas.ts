import { Type } from "@sinclair/typebox";

export const ErrorSchema = Type.Object({
  statusCode: Type.Integer(),
  code: Type.String(),
  message: Type.String(),
  requestId: Type.String(),
});

export const AuthOptionsSchema = Type.Object({
  instantAuth: Type.Boolean(),
});

export const InstantAuthBodySchema = Type.Object({
  email: Type.String({ format: "email", maxLength: 254 }),
  mode: Type.Union([Type.Literal("signup"), Type.Literal("signin")]),
  name: Type.Optional(Type.String({ maxLength: 80 })),
}, { additionalProperties: false });

export const InstantAuthResponseSchema = Type.Object({
  tokenHash: Type.String(),
  created: Type.Boolean(),
  name: Type.String(),
});

export const MemberSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  email: Type.String(),
  avatarUrl: Type.Optional(Type.String()),
  createdAt: Type.Optional(Type.String()),
});

export const GroupSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  currency: Type.String(),
  accent: Type.String(),
  members: Type.Array(MemberSchema),
  balanceMinor: Type.Integer(),
  role: Type.Union([Type.Literal("owner"), Type.Literal("admin"), Type.Literal("member")]),
});

export const SettlementSchema = Type.Object({
  id: Type.String(),
  groupId: Type.String(),
  debtor: MemberSchema,
  recipient: MemberSchema,
  amountMinor: Type.Integer(),
  currency: Type.String(),
  status: Type.Union([Type.Literal("awaiting_review"), Type.Literal("confirmed"), Type.Literal("needs_attention")]),
  proofUri: Type.Optional(Type.String()),
  note: Type.Optional(Type.String()),
  eventName: Type.Optional(Type.String()),
  eventDate: Type.Optional(Type.String()),
  recipientHasOpenedApp: Type.Optional(Type.Boolean()),
  canSelfSettle: Type.Optional(Type.Boolean()),
  selfSettleAvailableAt: Type.Optional(Type.String({ format: "date-time" })),
  confirmationMethod: Type.Optional(Type.Union([Type.Literal("recipient_review"), Type.Literal("claimant_fallback")])),
  createdAt: Type.String(),
});

export const ActivitySchema = Type.Object({
  id: Type.String(),
  icon: Type.Union([Type.Literal("file-text"), Type.Literal("send"), Type.Literal("check-circle"), Type.Literal("alert-circle"), Type.Literal("users")]),
  title: Type.String(),
  detail: Type.String(),
  createdAt: Type.String(),
  tone: Type.Union([Type.Literal("neutral"), Type.Literal("positive"), Type.Literal("warning")]),
});

export const TransactionSchema = Type.Object({
  id: Type.String(),
  source: Type.Union([Type.Literal("personal"), Type.Literal("group")]),
  groupId: Type.Optional(Type.String()),
  groupName: Type.Optional(Type.String()),
  title: Type.String(),
  eventDate: Type.String({ format: "date" }),
  amountMinor: Type.Integer(),
  currency: Type.String(),
  direction: Type.Union([Type.Literal("incoming"), Type.Literal("outgoing")]),
  kind: Type.Union([Type.Literal("expense"), Type.Literal("loan"), Type.Literal("payment")]),
  counterparty: Type.Optional(Type.String()),
  note: Type.Optional(Type.String()),
  receiptUri: Type.Optional(Type.String()),
  status: Type.Optional(Type.Union([Type.Literal("open"), Type.Literal("settled")])),
  settledAt: Type.Optional(Type.String()),
  createdAt: Type.String(),
});

export const PlanSchema = Type.Object({
  user: MemberSchema,
  totals: Type.Array(Type.Object({ currency: Type.String(), oweMinor: Type.Integer(), owedMinor: Type.Integer() })),
  groups: Type.Array(GroupSchema),
  reviews: Type.Array(SettlementSchema),
  claims: Type.Array(SettlementSchema),
  activity: Type.Array(ActivitySchema),
  transactions: Type.Array(TransactionSchema),
});

export const IdResponseSchema = Type.Object({ id: Type.String() });
export const UploadResponseSchema = Type.Object({ path: Type.String() });
export const UploadParamsSchema = Type.Object({ kind: Type.Union([Type.Literal("receipt"), Type.Literal("payment-proof"), Type.Literal("avatar")]) });
export const InviteBodySchema = Type.Object({ email: Type.Optional(Type.String({ format: "email", maxLength: 254 })) }, { additionalProperties: false });
export const InviteLinkSchema = Type.Object({ url: Type.String(), expiresAt: Type.String({ format: "date-time" }) });
export const TokenParamsSchema = Type.Object({ token: Type.String({ minLength: 32, maxLength: 200 }) });

export const CreateGroupSchema = Type.Object({
  name: Type.String({ minLength: 2, maxLength: 80 }),
  currency: Type.String({ minLength: 3, maxLength: 3 }),
  accent: Type.String({ pattern: "^#[0-9A-Fa-f]{6}$" }),
  inviteEmails: Type.Array(Type.String({ format: "email", maxLength: 254 }), { maxItems: 50 }),
}, { additionalProperties: false });

export const ExpenseShareSchema = Type.Object({
  memberId: Type.String({ minLength: 1 }),
  amountMinor: Type.Integer({ minimum: 0 }),
  percentageBasisPoints: Type.Optional(Type.Integer({ minimum: 0, maximum: 10000 })),
}, { additionalProperties: false });

export const CreateExpenseSchema = Type.Object({
  groupId: Type.String({ minLength: 1 }),
  eventName: Type.String({ minLength: 1, maxLength: 80 }),
  eventDate: Type.String({ format: "date" }),
  note: Type.Optional(Type.String({ maxLength: 500 })),
  amountMinor: Type.Integer({ minimum: 1, maximum: 100000000000 }),
  paidByMemberId: Type.String({ minLength: 1 }),
  splitMethod: Type.Union([Type.Literal("equal"), Type.Literal("exact"), Type.Literal("percentage")]),
  shares: Type.Array(ExpenseShareSchema, { minItems: 1, maxItems: 200 }),
  receiptUri: Type.Optional(Type.String({ maxLength: 2048 })),
}, { additionalProperties: false });

export const CreatePersonalTransactionSchema = Type.Object({
  title: Type.String({ minLength: 1, maxLength: 80 }),
  eventDate: Type.String({ format: "date" }),
  amountMinor: Type.Integer({ minimum: 1, maximum: 100000000000 }),
  currency: Type.String({ minLength: 3, maxLength: 3 }),
  kind: Type.Union([Type.Literal("expense"), Type.Literal("loan")]),
  direction: Type.Union([Type.Literal("incoming"), Type.Literal("outgoing")]),
  counterparty: Type.String({ minLength: 1, maxLength: 80 }),
  note: Type.Optional(Type.String({ maxLength: 500 })),
  receiptUri: Type.Optional(Type.String({ maxLength: 2048 })),
}, { additionalProperties: false });

export const CreateSettlementSchema = Type.Object({
  groupId: Type.String({ minLength: 1 }),
  recipientMemberId: Type.String({ minLength: 1 }),
  amountMinor: Type.Integer({ minimum: 1, maximum: 100000000000 }),
  note: Type.Optional(Type.String({ maxLength: 500 })),
  proofUri: Type.Optional(Type.String({ maxLength: 2048 })),
}, { additionalProperties: false });

export const ReviewSettlementSchema = Type.Object({
  note: Type.Optional(Type.String({ maxLength: 500 })),
}, { additionalProperties: false });

export const UpdateProfileSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 80 }),
  avatarPath: Type.Optional(Type.Union([Type.String({ minLength: 1, maxLength: 2048 }), Type.Null()])),
}, { additionalProperties: false });

export const IdParamsSchema = Type.Object({ id: Type.String({ minLength: 1 }) });

export const IdempotencyHeaderSchema = Type.Object({
  "idempotency-key": Type.String({ minLength: 8, maxLength: 200 }),
}, { additionalProperties: true });

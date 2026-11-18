import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  CreateExpenseSchema,
  CreateGroupSchema,
  CreatedPersonalTransactionSchema,
  CreatePersonalTransactionSchema,
  CreateSettlementSchema,
  ErrorSchema,
  ExpenseDetailSchema,
  GroupSchema,
  IdempotencyHeaderSchema,
  IdParamsSchema,
  IdResponseSchema,
  InviteBodySchema,
  InviteLinkSchema,
  PlanSchema,
  ReviewSettlementSchema,
  SettlePersonalTransactionSchema,
  SettlePersonalTransactionsSchema,
  MemberSchema,
  UpdateExpenseSchema,
  UpdatePersonalTransactionSchema,
  UpdateProfileSchema,
  UploadParamsSchema,
  UploadResponseSchema,
  TokenParamsSchema,
} from "../http/schemas.js";
import { DomainError } from "../domain/errors.js";
import type { PushSender } from "../push/fcm.js";
import { sendPaymentPush } from "../push/paymentPush.js";

const mutationResponses = {
  400: ErrorSchema,
  401: ErrorSchema,
  403: ErrorSchema,
  404: ErrorSchema,
  409: ErrorSchema,
};

type LedgerRoutesOptions = {
  /** Firebase sender; unset means no push for payment steps. */
  pushSender?: PushSender;
};

export const ledgerRoutes: FastifyPluginAsyncTypebox<LedgerRoutesOptions> = async (fastify, { pushSender }) => {
  fastify.post("/uploads/:kind", {
    schema: {
      tags: ["uploads"],
      security: [{ bearerAuth: [] }],
      consumes: ["multipart/form-data"],
      params: UploadParamsSchema,
      response: { 201: UploadResponseSchema, ...mutationResponses, 413: ErrorSchema, 415: ErrorSchema, 501: ErrorSchema },
    },
  }, async (request, reply) => {
    const file = await request.file();
    if (!file) throw new DomainError("An image file is required");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      throw new DomainError("Use a JPEG, PNG, or WebP image", 415, "unsupported_media_type");
    }
    const bytes = await file.toBuffer();
    const stored = await fastify.ledger.storeImage(request.authUser.id, request.params.kind, file.mimetype, bytes);
    return reply.code(201).send(stored);
  });

  fastify.get("/me/plan", {
    schema: {
      tags: ["plan"],
      security: [{ bearerAuth: [] }],
      response: { 200: PlanSchema, 401: ErrorSchema },
    },
  }, async (request) => fastify.ledger.getPlan(request.authUser.id));

  fastify.patch("/me/profile", {
    schema: {
      tags: ["profile"],
      security: [{ bearerAuth: [] }],
      body: UpdateProfileSchema,
      response: { 200: MemberSchema, ...mutationResponses },
    },
  }, async (request) => fastify.ledger.updateProfile(request.authUser.id, request.body));

  fastify.get("/groups/:id", {
    schema: {
      tags: ["groups"],
      security: [{ bearerAuth: [] }],
      params: IdParamsSchema,
      response: { 200: GroupSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema },
    },
  }, async (request) => fastify.ledger.getGroup(request.authUser.id, request.params.id));

  fastify.post("/groups/:id/invites", {
    schema: {
      tags: ["invites"],
      security: [{ bearerAuth: [] }],
      params: IdParamsSchema,
      body: InviteBodySchema,
      response: { 201: InviteLinkSchema, ...mutationResponses },
    },
  }, async (request, reply) => {
    const invite = await fastify.ledger.createInvite(request.authUser.id, request.params.id, request.body.email);
    return reply.code(201).send(invite);
  });

  fastify.post("/invites/:token/accept", {
    schema: {
      tags: ["invites"],
      security: [{ bearerAuth: [] }],
      params: TokenParamsSchema,
      response: { 200: GroupSchema, ...mutationResponses },
    },
  }, async (request) => fastify.ledger.acceptInvite(request.authUser.id, request.params.token));

  fastify.post("/groups", {
    schema: {
      tags: ["groups"],
      security: [{ bearerAuth: [] }],
      headers: IdempotencyHeaderSchema,
      body: CreateGroupSchema,
      response: { 201: GroupSchema, ...mutationResponses },
    },
  }, async (request, reply) => {
    const group = await fastify.ledger.createGroup(request.authUser.id, request.body, request.headers["idempotency-key"]);
    return reply.code(201).send(group);
  });

  fastify.post("/expenses", {
    schema: {
      tags: ["expenses"],
      security: [{ bearerAuth: [] }],
      headers: IdempotencyHeaderSchema,
      body: CreateExpenseSchema,
      response: { 201: IdResponseSchema, ...mutationResponses },
    },
  }, async (request, reply) => {
    const expense = await fastify.ledger.createExpense(request.authUser.id, request.body, request.headers["idempotency-key"]);
    return reply.code(201).send(expense);
  });

  fastify.post("/personal-transactions", {
    schema: {
      tags: ["transactions"],
      security: [{ bearerAuth: [] }],
      headers: IdempotencyHeaderSchema,
      body: CreatePersonalTransactionSchema,
      response: { 201: CreatedPersonalTransactionSchema, ...mutationResponses },
    },
  }, async (request, reply) => {
    const transaction = await fastify.ledger.createPersonalTransaction(request.authUser.id, request.body, request.headers["idempotency-key"]);
    return reply.code(201).send(transaction);
  });

  fastify.post("/personal-transactions/:id/settle", {
    schema: {
      tags: ["transactions"],
      security: [{ bearerAuth: [] }],
      headers: IdempotencyHeaderSchema,
      params: IdParamsSchema,
      // Older app versions settle without a body, so accept an empty request as "settle the whole remainder".
      body: Type.Union([SettlePersonalTransactionSchema, Type.Null()]),
      response: { 204: Type.Null(), ...mutationResponses },
    },
  }, async (request, reply) => {
    await fastify.ledger.settlePersonalTransaction(request.authUser.id, request.params.id, request.body?.amountMinor, request.headers["idempotency-key"]);
    return reply.code(204).send(null);
  });

  fastify.post("/personal-transactions/settle-all", {
    schema: {
      tags: ["transactions"],
      security: [{ bearerAuth: [] }],
      headers: IdempotencyHeaderSchema,
      body: SettlePersonalTransactionsSchema,
      response: { 204: Type.Null(), ...mutationResponses },
    },
  }, async (request, reply) => {
    await fastify.ledger.settlePersonalTransactions(request.authUser.id, request.body.transactionIds, request.headers["idempotency-key"]);
    return reply.code(204).send(null);
  });

  // Editing and deleting. The rules (who may, what is locked once payments exist) live in the database functions of
  // supabase/migrations/202611170013_edit_delete_entries.sql; a database without them answers 503 edit_unavailable.
  const editResponses = { ...mutationResponses, 503: ErrorSchema };

  fastify.get("/expenses/:id", {
    schema: {
      tags: ["expenses"],
      security: [{ bearerAuth: [] }],
      params: IdParamsSchema,
      response: { 200: ExpenseDetailSchema, ...editResponses },
    },
  }, async (request) => fastify.ledger.getExpense(request.authUser.id, request.params.id));

  fastify.patch("/expenses/:id", {
    schema: {
      tags: ["expenses"],
      security: [{ bearerAuth: [] }],
      params: IdParamsSchema,
      headers: IdempotencyHeaderSchema,
      body: UpdateExpenseSchema,
      response: { 200: IdResponseSchema, ...editResponses },
    },
  }, async (request) => fastify.ledger.updateExpense(request.authUser.id, request.params.id, request.body, request.headers["idempotency-key"]));

  fastify.delete("/expenses/:id", {
    schema: {
      tags: ["expenses"],
      security: [{ bearerAuth: [] }],
      params: IdParamsSchema,
      response: { 204: Type.Null(), ...editResponses },
    },
  }, async (request, reply) => {
    await fastify.ledger.deleteExpense(request.authUser.id, request.params.id);
    return reply.code(204).send(null);
  });

  fastify.patch("/personal-transactions/:id", {
    schema: {
      tags: ["transactions"],
      security: [{ bearerAuth: [] }],
      params: IdParamsSchema,
      body: UpdatePersonalTransactionSchema,
      response: { 200: IdResponseSchema, ...editResponses },
    },
  }, async (request) => fastify.ledger.updatePersonalTransaction(request.authUser.id, request.params.id, request.body));

  fastify.delete("/personal-transactions/:id", {
    schema: {
      tags: ["transactions"],
      security: [{ bearerAuth: [] }],
      params: IdParamsSchema,
      response: { 204: Type.Null(), ...editResponses },
    },
  }, async (request, reply) => {
    await fastify.ledger.deletePersonalTransaction(request.authUser.id, request.params.id);
    return reply.code(204).send(null);
  });

  fastify.post("/settlements", {
    schema: {
      tags: ["settlements"],
      security: [{ bearerAuth: [] }],
      headers: IdempotencyHeaderSchema,
      body: CreateSettlementSchema,
      response: { 201: IdResponseSchema, ...mutationResponses },
    },
  }, async (request, reply) => {
    const settlement = await fastify.ledger.createSettlement(request.authUser.id, request.body, request.headers["idempotency-key"]);
    await sendPaymentPush({ ledger: fastify.ledger, sender: pushSender, log: request.log, userId: request.authUser.id, settlementId: settlement.id, event: "claimed" });
    return reply.code(201).send(settlement);
  });

  fastify.post("/settlements/:id/confirm", {
    schema: {
      tags: ["settlements"],
      security: [{ bearerAuth: [] }],
      headers: IdempotencyHeaderSchema,
      params: IdParamsSchema,
      body: ReviewSettlementSchema,
      response: { 204: Type.Null(), ...mutationResponses },
    },
  }, async (request, reply) => {
    await fastify.ledger.reviewSettlement(request.authUser.id, request.params.id, "confirmed", request.body.note, request.headers["idempotency-key"]);
    await sendPaymentPush({ ledger: fastify.ledger, sender: pushSender, log: request.log, userId: request.authUser.id, settlementId: request.params.id, event: "confirmed" });
    return reply.code(204).send(null);
  });

  fastify.post("/settlements/:id/attention", {
    schema: {
      tags: ["settlements"],
      security: [{ bearerAuth: [] }],
      headers: IdempotencyHeaderSchema,
      params: IdParamsSchema,
      body: ReviewSettlementSchema,
      response: { 204: Type.Null(), ...mutationResponses },
    },
  }, async (request, reply) => {
    await fastify.ledger.reviewSettlement(request.authUser.id, request.params.id, "needs_attention", request.body.note, request.headers["idempotency-key"]);
    await sendPaymentPush({ ledger: fastify.ledger, sender: pushSender, log: request.log, userId: request.authUser.id, settlementId: request.params.id, event: "needs_attention" });
    return reply.code(204).send(null);
  });

  fastify.post("/settlements/:id/self-confirm", {
    schema: {
      tags: ["settlements"],
      security: [{ bearerAuth: [] }],
      headers: IdempotencyHeaderSchema,
      params: IdParamsSchema,
      response: { 204: Type.Null(), ...mutationResponses },
    },
  }, async (request, reply) => {
    await fastify.ledger.selfConfirmSettlement(request.authUser.id, request.params.id, request.headers["idempotency-key"]);
    await sendPaymentPush({ ledger: fastify.ledger, sender: pushSender, log: request.log, userId: request.authUser.id, settlementId: request.params.id, event: "self_confirmed" });
    return reply.code(204).send(null);
  });
};

import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  CreateExpenseSchema,
  CreateGroupSchema,
  CreatePersonalTransactionSchema,
  CreateSettlementSchema,
  ErrorSchema,
  GroupSchema,
  IdempotencyHeaderSchema,
  IdParamsSchema,
  IdResponseSchema,
  InviteBodySchema,
  InviteLinkSchema,
  PlanSchema,
  ReviewSettlementSchema,
  UploadParamsSchema,
  UploadResponseSchema,
  TokenParamsSchema,
} from "../http/schemas.js";
import { DomainError } from "../domain/errors.js";

const mutationResponses = {
  400: ErrorSchema,
  401: ErrorSchema,
  403: ErrorSchema,
  404: ErrorSchema,
  409: ErrorSchema,
};

export const ledgerRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
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
      response: { 201: IdResponseSchema, ...mutationResponses },
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
      response: { 204: Type.Null(), ...mutationResponses },
    },
  }, async (request, reply) => {
    await fastify.ledger.settlePersonalTransaction(request.authUser.id, request.params.id, request.headers["idempotency-key"]);
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
    return reply.code(204).send(null);
  });
};

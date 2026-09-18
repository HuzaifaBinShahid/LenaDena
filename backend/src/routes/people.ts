import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { CreatePersonSchema, ErrorSchema, IdParamsSchema, PersonSchema, UpdatePersonSchema } from "../http/schemas.js";

// People are contact details, not money, so these writes need no idempotency key. The list itself is served
// with the plan (`GET /v1/me/plan` -> `people`).
const errorResponses = {
  400: ErrorSchema,
  401: ErrorSchema,
  404: ErrorSchema,
  409: ErrorSchema,
  503: ErrorSchema,
};

export const peopleRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.post("/people", {
    schema: {
      tags: ["people"],
      security: [{ bearerAuth: [] }],
      body: CreatePersonSchema,
      response: { 201: PersonSchema, ...errorResponses },
    },
  }, async (request, reply) => {
    const person = await fastify.ledger.createPerson(request.authUser.id, request.body);
    return reply.code(201).send(person);
  });

  fastify.patch("/people/:id", {
    schema: {
      tags: ["people"],
      security: [{ bearerAuth: [] }],
      params: IdParamsSchema,
      body: UpdatePersonSchema,
      response: { 200: PersonSchema, ...errorResponses },
    },
  }, async (request) => fastify.ledger.updatePerson(request.authUser.id, request.params.id, request.body));

  fastify.delete("/people/:id", {
    schema: {
      tags: ["people"],
      security: [{ bearerAuth: [] }],
      params: IdParamsSchema,
      response: { 204: Type.Null(), ...errorResponses },
    },
  }, async (request, reply) => {
    await fastify.ledger.deletePerson(request.authUser.id, request.params.id);
    return reply.code(204).send(null);
  });
};

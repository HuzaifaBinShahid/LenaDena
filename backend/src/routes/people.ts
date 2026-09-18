import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { AppConfig } from "../config.js";
import { resolveInviteDownloadUrl } from "../domain/people.js";
import { CreatePersonSchema, ErrorSchema, IdParamsSchema, InvitePersonSchema, PersonInviteSchema, PersonSchema, UpdatePersonSchema } from "../http/schemas.js";

type PeopleRoutesOptions = {
  config: Pick<AppConfig, "appDownloadUrl">;
};

// People are contact details, not money, so these writes need no idempotency key. The list itself is served
// with the plan (`GET /v1/me/plan` -> `people`).
const errorResponses = {
  400: ErrorSchema,
  401: ErrorSchema,
  404: ErrorSchema,
  409: ErrorSchema,
  503: ErrorSchema,
};

export const peopleRoutes: FastifyPluginAsyncTypebox<PeopleRoutesOptions> = async (fastify, { config }) => {
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

  // Emails a saved person an invite to install LenaDena. The database allows one per person per 12 hours; the
  // tighter route limit also caps how fast one account can mail different people.
  fastify.post("/people/:id/invite", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    // The body is optional: a bare POST means "no link suggested".
    preValidation: async (request) => {
      request.body ??= {};
    },
    schema: {
      tags: ["people"],
      security: [{ bearerAuth: [] }],
      params: IdParamsSchema,
      body: InvitePersonSchema,
      response: { 202: PersonInviteSchema, ...errorResponses, 429: ErrorSchema },
    },
  }, async (request, reply) => {
    const downloadUrl = resolveInviteDownloadUrl(config.appDownloadUrl, request.body.downloadUrl);
    const invite = await fastify.ledger.invitePerson(request.authUser.id, request.params.id, downloadUrl);
    return reply.code(202).send(invite);
  });
};

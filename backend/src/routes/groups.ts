import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import {
  ErrorSchema, GroupPeopleSchema, GroupSchema, IdParamsSchema, InvitationSchema, InviteByEmailSchema, InviteLinkSchema, MemberParamsSchema, RenameGroupSchema,
} from "../http/schemas.js";
import type { PushSender } from "../push/fcm.js";
import { invitationMessage } from "../push/messages.js";
import { within } from "../push/within.js";

type GroupRoutesOptions = {
  /** Firebase sender; unset means no push for invitations. */
  pushSender?: PushSender;
  /**
   * When pushes are on, an invitation always takes at least this long to answer, so how long it took cannot tell the
   * inviter whether the address belongs to an account with a phone registered. Best effort, not a guarantee.
   */
  inviteFloorMs?: number;
};

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/**
 * Group management: invite by email (an account also sees it in the app and accepts or declines there), the member
 * list, leaving, removing and renaming. The rules are in supabase/migrations/202611170015_group_members.sql; a
 * database without it answers 503 groups_unavailable.
 */
export const groupRoutes: FastifyPluginAsyncTypebox<GroupRoutesOptions> = async (fastify, { pushSender, inviteFloorMs = 800 }) => {
  const errors = { 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema, 429: ErrorSchema, 503: ErrorSchema };

  fastify.get("/me/invitations", {
    schema: { tags: ["groups"], security: [{ bearerAuth: [] }], response: { 200: Type.Array(InvitationSchema), ...errors } },
  }, async (request) => fastify.ledger.listInvitations(request.authUser.id));

  fastify.post("/me/invitations/:id/accept", {
    schema: { tags: ["groups"], security: [{ bearerAuth: [] }], params: IdParamsSchema, response: { 200: GroupSchema, ...errors } },
  }, async (request) => fastify.ledger.acceptInvitation(request.authUser.id, request.params.id));

  fastify.post("/me/invitations/:id/decline", {
    schema: { tags: ["groups"], security: [{ bearerAuth: [] }], params: IdParamsSchema, response: { 204: Type.Null(), ...errors } },
  }, async (request, reply) => {
    await fastify.ledger.declineInvitation(request.authUser.id, request.params.id);
    return reply.code(204).send(null);
  });

  fastify.post("/groups/:id/invitations", {
    // The database also caps invitations at 30 a day per person.
    config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
    schema: { tags: ["groups"], security: [{ bearerAuth: [] }], params: IdParamsSchema, body: InviteByEmailSchema, response: { 201: InviteLinkSchema, ...errors } },
  }, async (request, reply) => {
    const link = await fastify.ledger.inviteMember(request.authUser.id, request.params.id, request.body.email);
    if (pushSender) {
      // A phone notification for someone who already has an account, best effort: it never changes the answer.
      const started = Date.now();
      try {
        const target = await fastify.ledger.getInvitationPushTarget(request.authUser.id, request.params.id, request.body.email);
        if (target) {
          const result = await within(pushSender.send(target.tokens, invitationMessage(target)), 3000);
          if (result?.invalidTokens.length) await fastify.ledger.dropPushTokens(result.invalidTokens);
        }
      } catch (error) {
        request.log.warn({ err: error instanceof Error ? error.message : "unknown" }, "invitation push failed");
      }
      const wait = inviteFloorMs - (Date.now() - started);
      if (wait > 0) await sleep(wait);
    }
    return reply.code(201).send(link);
  });

  fastify.get("/groups/:id/members", {
    schema: { tags: ["groups"], security: [{ bearerAuth: [] }], params: IdParamsSchema, response: { 200: GroupPeopleSchema, ...errors } },
  }, async (request) => fastify.ledger.getGroupPeople(request.authUser.id, request.params.id));

  fastify.delete("/groups/:id/members/:memberId", {
    schema: { tags: ["groups"], security: [{ bearerAuth: [] }], params: MemberParamsSchema, response: { 204: Type.Null(), ...errors } },
  }, async (request, reply) => {
    await fastify.ledger.removeMember(request.authUser.id, request.params.id, request.params.memberId);
    return reply.code(204).send(null);
  });

  fastify.post("/groups/:id/leave", {
    schema: { tags: ["groups"], security: [{ bearerAuth: [] }], params: IdParamsSchema, response: { 204: Type.Null(), ...errors } },
  }, async (request, reply) => {
    await fastify.ledger.leaveGroup(request.authUser.id, request.params.id);
    return reply.code(204).send(null);
  });

  fastify.patch("/groups/:id", {
    schema: { tags: ["groups"], security: [{ bearerAuth: [] }], params: IdParamsSchema, body: RenameGroupSchema, response: { 204: Type.Null(), ...errors } },
  }, async (request, reply) => {
    await fastify.ledger.renameGroup(request.authUser.id, request.params.id, request.body.name);
    return reply.code(204).send(null);
  });
};

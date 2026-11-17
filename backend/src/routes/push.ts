import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { PushUnavailableError } from "../domain/push.js";
import { ErrorSchema, IdParamsSchema, NudgeBodySchema, NudgeResultSchema, PushTokenSchema, RemovePushTokenSchema } from "../http/schemas.js";
import type { PushSender } from "../push/fcm.js";
import { nudgeMessage } from "../push/messages.js";

type PushRoutesOptions = { sender?: PushSender };

/**
 * Push notifications through Firebase Cloud Messaging: registering this phone, and "Remind" on a member who owes the
 * caller money. The rules (who may be reminded, once a day per person and group, 15 a day) live in
 * supabase/migrations/202611170016_push_notifications.sql; this sends the message and cleans up after Firebase.
 *
 * Without Firebase credentials (`sender` unset) a phone cannot register (503 push_unavailable) and a reminder
 * answers `unavailable` without touching the database, so the app offers to share a message instead.
 */
export const pushRoutes: FastifyPluginAsyncTypebox<PushRoutesOptions> = async (fastify, { sender }) => {
  const errors = { 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema, 429: ErrorSchema, 503: ErrorSchema };

  fastify.post("/me/push-token", {
    config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
    schema: { tags: ["push"], security: [{ bearerAuth: [] }], body: PushTokenSchema, response: { 204: Type.Null(), ...errors } },
  }, async (request, reply) => {
    if (!sender) throw new PushUnavailableError();
    await fastify.ledger.registerPushToken(request.authUser.id, request.body.token, request.body.platform);
    return reply.code(204).send(null);
  });

  // POST rather than DELETE: the token is secret-ish and belongs in a body, not in a URL that gets logged.
  fastify.post("/me/push-token/remove", {
    config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
    schema: { tags: ["push"], security: [{ bearerAuth: [] }], body: RemovePushTokenSchema, response: { 204: Type.Null(), ...errors } },
  }, async (request, reply) => {
    await fastify.ledger.removePushToken(request.authUser.id, request.body.token);
    return reply.code(204).send(null);
  });

  fastify.post("/groups/:id/nudges", {
    // The database also caps reminders at one per person per group per day, and 15 a day.
    config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
    schema: { tags: ["push"], security: [{ bearerAuth: [] }], params: IdParamsSchema, body: NudgeBodySchema, response: { 200: NudgeResultSchema, ...errors } },
  }, async (request) => {
    if (!sender) return { status: "unavailable" as const };
    const userId = request.authUser.id;
    const delivery = await fastify.ledger.createNudge(userId, request.params.id, request.body.memberId);
    if (!delivery.nudgeId || delivery.tokens.length === 0) return { status: "no_device" as const };
    const result = await sender.send(delivery.tokens, nudgeMessage(delivery)).catch((error: unknown) => {
      request.log.warn({ err: error instanceof Error ? error.message : "unknown" }, "push send threw");
      return { delivered: 0, invalidTokens: [] as string[], failed: delivery.tokens.length };
    });
    if (result.invalidTokens.length > 0) {
      await fastify.ledger.dropPushTokens(result.invalidTokens).catch((error: unknown) => request.log.warn({ err: error instanceof Error ? error.message : "unknown" }, "could not drop dead push tokens"));
    }
    if (result.delivered > 0) return { status: "sent" as const };
    // Nothing got through: take the reminder back so a failed send does not use up the day.
    await fastify.ledger.undoNudge(userId, delivery.nudgeId).catch((error: unknown) => request.log.warn({ err: error instanceof Error ? error.message : "unknown" }, "could not undo a reminder"));
    return { status: result.failed > 0 ? "failed" as const : "no_device" as const };
  });
};

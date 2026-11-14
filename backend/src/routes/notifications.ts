import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { AppConfig } from "../config.js";
import { DomainError } from "../domain/errors.js";
import { ErrorSchema } from "../http/schemas.js";
import { loadNotificationConfig } from "../notifications/config.js";
import { createNotificationRunner, type NotificationRunner } from "../notifications/runner.js";

/**
 * How many emails one scheduled pass sends. A serverless call has a time limit and a statement PDF takes a moment, so
 * a small batch every minute is safer than a big one; reminders and statements are never urgent to the second.
 */
const HOSTED_BATCH_SIZE = 3;

function sameSecret(given: string, expected: string): boolean {
  // Compare fixed-length digests so neither the length nor the content of the secret leaks through timing.
  return timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(expected).digest());
}

/**
 * The hosted email worker. A scheduler (Supabase's pg_cron, calling this every minute) sends one pass of the outbox:
 * it queues reminders an owner switched on, then sends what is waiting. Needs NOTIFICATIONS_CRON_SECRET; without it the
 * route is not registered at all. Lives outside /v1, so it never uses a person's sign-in: only the shared secret.
 */
export const notificationRoutes: FastifyPluginAsyncTypebox<{ config: AppConfig; runner?: NotificationRunner }> = async (fastify, options) => {
  const secret = options.config.notificationsCronSecret;
  if (!secret) return;
  let runner = options.runner;

  fastify.post("/internal/notifications/run", {
    // The scheduler calls once a minute; this also caps anyone guessing at the secret.
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: {
      hide: true,
      response: {
        200: Type.Object({ claimed: Type.Integer(), sent: Type.Integer(), failed: Type.Integer(), skipped: Type.Integer() }),
        401: ErrorSchema,
        429: ErrorSchema,
        503: ErrorSchema,
      },
    },
  }, async (request, reply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ") || !sameSecret(header.slice("Bearer ".length), secret)) {
      throw new DomainError("A valid scheduler secret is required", 401, "unauthorized");
    }
    if (!runner) {
      try {
        runner = createNotificationRunner(loadNotificationConfig());
      } catch (cause) {
        request.log.error({ err: cause }, "notification runner is not configured");
        throw new DomainError("Email sending is not configured on this server", 503, "notifications_not_configured");
      }
    }
    return reply.code(200).send(await runner.runBatch({ limit: HOSTED_BATCH_SIZE }));
  });
};

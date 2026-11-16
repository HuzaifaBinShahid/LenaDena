import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { AppConfig } from "../config.js";
import { isRecentPasswordSignIn, RecentSignInRequiredError } from "../domain/account.js";
import { DeleteAccountSchema, ErrorSchema } from "../http/schemas.js";

/**
 * Deleting an account. Stores require that this is possible from inside the app. It cannot be undone, so on top of the
 * confirmation word the API wants proof that the password was typed in the last few minutes (the app signs the person
 * in again with it just before calling this). A stolen unlocked phone with an older session cannot do it.
 */
export const accountRoutes: FastifyPluginAsyncTypebox<{ config: Pick<AppConfig, "authMode"> }> = async (fastify, options) => {
  fastify.post("/me/delete", {
    config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
    schema: {
      tags: ["profile"],
      security: [{ bearerAuth: [] }],
      body: DeleteAccountSchema,
      response: { 204: Type.Null(), 400: ErrorSchema, 401: ErrorSchema, 403: ErrorSchema, 429: ErrorSchema, 500: ErrorSchema, 503: ErrorSchema },
    },
  }, async (request, reply) => {
    // Demo mode has no sign-in to check; with real accounts the password sign-in must be recent.
    if (options.config.authMode === "supabase" && !isRecentPasswordSignIn(request.authUser.passwordSignInAt)) {
      throw new RecentSignInRequiredError();
    }
    await fastify.ledger.deleteAccount(request.authUser.id);
    return reply.code(204).send(null);
  });
};

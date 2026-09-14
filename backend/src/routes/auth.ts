import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { InstantAuthGateway } from "../auth/InstantAuthGateway.js";
import type { AppConfig } from "../config.js";
import { DomainError } from "../domain/errors.js";
import { AuthOptionsSchema, ErrorSchema, InstantAuthBodySchema, InstantAuthResponseSchema } from "../http/schemas.js";

type AuthRoutesOptions = {
  config: AppConfig;
  gateway?: InstantAuthGateway;
};

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Native apps send no Origin header. Browsers always do, so a page on another site cannot use a
 * developer's local API to mint sessions; only loopback pages (Expo web) and configured origins pass.
 */
export function isTrustedAuthOrigin(origin: string | undefined, corsOrigin: string) {
  if (!origin) return true;
  try {
    if (loopbackHosts.has(new URL(origin).hostname)) return true;
  } catch {
    return false;
  }
  return corsOrigin !== "*" && corsOrigin.split(",").map((value) => value.trim()).includes(origin);
}

export const authRoutes: FastifyPluginAsyncTypebox<AuthRoutesOptions> = async (fastify, { config, gateway }) => {
  const instantAuth = Boolean(config.allowInstantAuth && config.authMode === "supabase" && gateway);

  fastify.get("/auth/options", {
    schema: {
      tags: ["auth"],
      response: { 200: AuthOptionsSchema },
    },
  }, async () => ({ instantAuth }));

  fastify.post("/auth/instant", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    schema: {
      tags: ["auth"],
      body: InstantAuthBodySchema,
      response: { 200: InstantAuthResponseSchema, 400: ErrorSchema, 403: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema, 429: ErrorSchema, 502: ErrorSchema },
    },
  }, async (request) => {
    if (!instantAuth || !gateway) {
      throw new DomainError("Instant sign-in is turned off on this server", 404, "instant_auth_disabled");
    }
    if (!isTrustedAuthOrigin(request.headers.origin, config.corsOrigin)) {
      throw new DomainError("Instant sign-in is not available from this site", 403, "origin_not_allowed");
    }

    const email = request.body.email.trim().toLowerCase();
    const name = request.body.name?.trim() ?? "";
    const upstream = async <T>(task: () => Promise<T>) => {
      try {
        return await task();
      } catch (error) {
        request.log.warn({ err: error }, "instant authentication failed");
        throw new DomainError("Sign-in is unavailable right now. Try again in a moment.", 502, "auth_provider_error");
      }
    };

    if (request.body.mode === "signup") {
      if (!name) throw new DomainError("Add your name to create an account", 400, "name_required");
      const account = await upstream(() => gateway.createAccount(email, name));
      if (!account) throw new DomainError("An account already uses this email. Sign in instead.", 409, "account_exists");
      const token = await upstream(() => gateway.issueSignInToken(email));
      if (!token) throw new DomainError("Your account was created, but sign-in didn't finish. Try signing in.", 502, "auth_provider_error");
      return { tokenHash: token.tokenHash, created: true, name: account.name };
    }

    const token = await upstream(() => gateway.issueSignInToken(email));
    if (!token) throw new DomainError("No LenaDena account uses this email yet.", 404, "account_not_found");
    return { tokenHash: token.tokenHash, created: false, name: token.account.name };
  });
};

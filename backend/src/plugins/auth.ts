import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { createClient, isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { AppConfig } from "../config.js";
import { DomainError } from "../domain/errors.js";

/**
 * Turns `Authorization: Bearer <Supabase access token>` into `request.authUser` for every /v1 route. Accounts sign
 * up and sign in directly with Supabase Auth (email and password), so the API has no public sign-in routes: every
 * /v1 request needs a token Supabase vouches for.
 */
export const authPlugin = fp(async function authPlugin(fastify, config: AppConfig) {
  const supabase = config.authMode === "supabase" && config.supabaseUrl && config.supabaseSecretKey
    ? createClient(config.supabaseUrl, config.supabaseSecretKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  fastify.decorateRequest("authUser");
  fastify.addHook("onRequest", async (request, reply) => {
    // Decide from the route that matched, not the raw URL: `/%76%31/me/plan` is the same route as `/v1/me/plan` once
    // the router decodes it, but its raw text does not start with "/v1/". A request that matches no route gets a 404
    // before any handler runs, so it needs no check.
    if (!request.routeOptions.url?.startsWith("/v1/")) {
      return;
    }
    if (config.authMode === "demo") {
      const header = request.headers["x-user-id"];
      request.authUser = { id: typeof header === "string" && header ? header : "demo-user" };
      return;
    }
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ") || !supabase) {
      throw new DomainError("A bearer token is required", 401, "unauthorized");
    }
    const token = authorization.slice("Bearer ".length);
    const { data, error } = await supabase.auth.getUser(token);
    // A 401 tells the client its session is over; an unreachable Auth service must not say that.
    if (error && (isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500)) {
      request.log.warn({ err: error }, "could not verify bearer token");
      throw new DomainError("Sign-in could not be checked right now. Try again in a moment.", 503, "auth_unavailable");
    }
    if (error || !data.user) {
      throw new DomainError("The bearer token is invalid or expired", 401, "unauthorized");
    }
    // Group invites are matched to the account's email address, so an address nobody has proven they own must not
    // reach any data. With "Confirm email" on, Supabase issues no session before the link is opened, so this is a
    // second lock. It does not replace that dashboard setting: with "Confirm email" off, Supabase fills in
    // `email_confirmed_at` itself and this check passes.
    if (!data.user.email_confirmed_at) {
      throw new DomainError("Confirm your email address first: open the link we sent to your inbox.", 403, "email_not_confirmed");
    }
    request.authUser = data.user.email ? { id: data.user.id, email: data.user.email } : { id: data.user.id };
  });
} as FastifyPluginAsync<AppConfig>);

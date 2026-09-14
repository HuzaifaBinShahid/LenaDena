import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { createClient, isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { AppConfig } from "../config.js";
import { DomainError } from "../domain/errors.js";

export const authPlugin = fp(async function authPlugin(fastify, config: AppConfig) {
  const supabase = config.authMode === "supabase" && config.supabaseUrl && config.supabaseSecretKey
    ? createClient(config.supabaseUrl, config.supabaseSecretKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  fastify.decorateRequest("authUser");
  fastify.addHook("onRequest", async (request, reply) => {
    // /v1/auth/* are the public routes a signed-out client uses to obtain a session.
    if (!request.url.startsWith("/v1/") || request.url.startsWith("/v1/auth/")) {
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
    request.authUser = data.user.email ? { id: data.user.id, email: data.user.email } : { id: data.user.id };
  });
} as FastifyPluginAsync<AppConfig>);

import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { createClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config.js";
import { DomainError } from "../domain/errors.js";

export const authPlugin = fp(async function authPlugin(fastify, config: AppConfig) {
  const supabase = config.authMode === "supabase" && config.supabaseUrl && config.supabaseSecretKey
    ? createClient(config.supabaseUrl, config.supabaseSecretKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  fastify.decorateRequest("authUser");
  fastify.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/v1/")) {
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
    if (error || !data.user) {
      throw new DomainError("The bearer token is invalid or expired", 401, "unauthorized");
    }
    request.authUser = data.user.email ? { id: data.user.id, email: data.user.email } : { id: data.user.id };
  });
} as FastifyPluginAsync<AppConfig>);

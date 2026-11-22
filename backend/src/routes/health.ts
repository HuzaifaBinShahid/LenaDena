import type { FastifyBaseLogger } from "fastify";
import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Static, Type } from "@sinclair/typebox";
import type { AppConfig } from "../config.js";
import { supabaseCallName, traced } from "../observability/upstream.js";
import type { LedgerRepository } from "../repositories/LedgerRepository.js";

type HealthOptions = {
  config: AppConfig;
  /** Whether a Firebase sender was built (credentials present and usable). */
  pushOn: boolean;
};

/** Each dependency gets this long, and the two are asked at the same time, so the check itself stays under a few seconds. */
const CHECK_TIMEOUT_MS = 3000;
/** The answer is kept this long, so a monitor (or anyone) calling often cannot turn this into load on the database. */
const CACHE_MS = 10_000;

const ReadySchema = Type.Object({
  status: Type.Union([Type.Literal("ok"), Type.Literal("degraded"), Type.Literal("down")]),
  version: Type.String(),
  timestamp: Type.String(),
  /** How long the checks took when they were last run. */
  ms: Type.Number(),
  checks: Type.Object({
    database: Type.Union([Type.Literal("ok"), Type.Literal("down"), Type.Literal("demo")]),
    auth: Type.Union([Type.Literal("ok"), Type.Literal("down"), Type.Literal("demo")]),
    /** "behind": the database lacks something a migration adds. "unknown": the check function itself is not installed. */
    migrations: Type.Union([Type.Literal("ok"), Type.Literal("behind"), Type.Literal("unknown"), Type.Literal("demo")]),
    /** "invalid": a Firebase key is set but unusable. "off": none is set. */
    push: Type.Union([Type.Literal("on"), Type.Literal("off"), Type.Literal("invalid")]),
  }),
});
type Ready = Static<typeof ReadySchema>;

// Looks `fetch` up at call time, so a test can stand in for it.
// The build machine's typings for the global `Response` can be incomplete, so only the two members used here are declared.
type AuthReply = { status: number; body?: { cancel(): Promise<unknown> } | null };
const tracedFetch = traced((url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => fetch(url, init as never) as unknown as Promise<AuthReply>, supabaseCallName);

/** Supabase Auth answers at all (any answer below 500: the service is up, whatever it thinks of our key). */
async function authReachable(config: AppConfig): Promise<boolean> {
  if (!config.supabaseUrl) return false;
  try {
    const response = await tracedFetch(`${config.supabaseUrl.replace(/\/+$/, "")}/auth/v1/health`, {
      ...(config.supabaseSecretKey ? { headers: { apikey: config.supabaseSecretKey } } : {}),
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    void response.body?.cancel().catch(() => undefined);
    return response.status < 500;
  } catch {
    return false;
  }
}

async function runChecks(config: AppConfig, ledger: LedgerRepository, pushOn: boolean, log: FastifyBaseLogger): Promise<Ready> {
  const started = performance.now();
  const push: Ready["checks"]["push"] = pushOn ? "on" : config.firebaseInvalid ? "invalid" : "off";
  const base = { version: "0.1.0", timestamp: new Date().toISOString() };
  if (config.authMode !== "supabase") {
    return { status: push === "invalid" ? "degraded" : "ok", ...base, ms: 0, checks: { database: "demo", auth: "demo", migrations: "demo", push } };
  }
  const [database, auth] = await Promise.allSettled([ledger.checkHealth(CHECK_TIMEOUT_MS), authReachable(config)]);
  const databaseUp = database.status === "fulfilled";
  const authUp = auth.status === "fulfilled" && auth.value;
  if (database.status === "rejected") log.warn({ err: database.reason instanceof Error ? database.reason.message : "unknown" }, "health: the database did not answer");
  if (!authUp) log.warn("health: Supabase Auth did not answer");
  let migrations: Ready["checks"]["migrations"] = "unknown";
  if (database.status === "fulfilled") {
    const { missing } = database.value;
    if (missing === null) log.warn("health: app_health_check is missing: apply supabase/migrations/202611180017_payment_push_and_health.sql");
    else if (missing.length > 0) log.warn({ missing }, "health: the database lacks these features: apply the newer migrations in supabase/migrations");
    migrations = missing === null ? "unknown" : missing.length > 0 ? "behind" : "ok";
  }
  const status: Ready["status"] = !databaseUp || !authUp ? "down" : migrations === "behind" || push === "invalid" ? "degraded" : "ok";
  return {
    status,
    ...base,
    ms: Math.round(performance.now() - started),
    checks: { database: databaseUp ? "ok" : "down", auth: authUp ? "ok" : "down", migrations: databaseUp ? migrations : "unknown", push },
  };
}

export const healthRoutes: FastifyPluginAsyncTypebox<HealthOptions> = async (fastify, { config, pushOn }) => {
  // Liveness: the function runs. Cheap and always 200, for anything that only needs to know the API is not down.
  fastify.get("/health", {
    schema: {
      tags: ["system"],
      response: {
        200: Type.Object({ status: Type.Literal("ok"), version: Type.String(), timestamp: Type.String() }),
      },
    },
  }, async () => ({ status: "ok" as const, version: "0.1.0", timestamp: new Date().toISOString() }));

  let cached: { at: number; result: Ready } | undefined;
  let pending: Promise<Ready> | undefined;
  const current = (log: FastifyBaseLogger): Promise<Ready> => {
    if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.result);
    pending ??= runChecks(config, fastify.ledger, pushOn, log)
      .then((result) => { cached = { at: Date.now(), result }; return result; })
      .finally(() => { pending = undefined; });
    return pending;
  };

  // Readiness: the things a request needs are reachable. 200 when they are (also "degraded": it works, but something
  // needs attention), 503 when the database or Supabase Auth does not answer. Point an uptime monitor here. It says
  // only what is wrong in broad terms; the details (which features are missing) go to the log.
  fastify.get("/health/ready", {
    schema: { tags: ["system"], response: { 200: ReadySchema, 503: ReadySchema } },
  }, async (request, reply) => {
    const result = await current(request.log);
    reply.header("cache-control", "no-store");
    return reply.code(result.status === "down" ? 503 : 200).send({ ...result, timestamp: new Date().toISOString() });
  });
};

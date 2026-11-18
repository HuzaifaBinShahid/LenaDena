import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { runWithTrace, summarize, type UpstreamTrace } from "../observability/upstream.js";

type TimingOptions = {
  /** A request at least this slow is logged as a warning, with the calls that took the time. */
  slowMs: number;
};

/** Routes that are not logged at all: the shallow health check is polled all day and says nothing new. */
const QUIET_ROUTES = new Set(["/health"]);

/** For a request that matched no route there is no pattern to log, so log the path without its query string, cut short. */
const unmatchedPath = (url: string) => url.split("?")[0]?.slice(0, 100) ?? "";

/**
 * One log line per request, in place of Fastify's own two ("incoming request" and "request completed"):
 *
 *   { reqId, method, route, status, ms, upstreamMs, upstream: ["db rpc app_get_plan 212ms", ...] }
 *
 * `route` is the route's pattern (`/v1/groups/:id/nudges`), never the address that was called, so ids and invitation
 * tokens in paths stay out of the logs. `ms` is the whole request; `upstreamMs` is the time spent waiting on Supabase
 * and Firebase (see observability/upstream.ts), so a slow request shows at once whether the time went to this server
 * or to something it called. The line is a warning when the request was slow or a call to another service failed,
 * which is what to search for first when something feels off. Register this plugin before any other hook that calls
 * out (rate limiting, authentication), or those calls are not recorded.
 */
export const timingPlugin = fp(async function timingPlugin(fastify, options: TimingOptions) {
  fastify.decorateRequest("upstream");

  fastify.addHook("onRequest", (request, _reply, done) => {
    const trace: UpstreamTrace = { calls: [] };
    request.upstream = trace;
    runWithTrace(trace, done);
  });

  fastify.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions?.url;
    if (route && QUIET_ROUTES.has(route)) return;
    const ms = Math.round(reply.elapsedTime);
    const summary = summarize(request.upstream ?? { calls: [] });
    const slow = ms >= options.slowMs;
    const fields = {
      method: request.method,
      route: route ?? `(no route) ${unmatchedPath(request.url)}`,
      status: reply.statusCode,
      ms,
      ...(summary.calls > 0 ? { upstreamMs: summary.upstreamMs, upstream: summary.slowest } : {}),
      ...(summary.calls > summary.slowest.length ? { upstreamCalls: summary.calls } : {}),
    };
    if (slow) request.log.warn(fields, "slow request");
    else if (summary.failed) request.log.warn(fields, "request with a failed call to another service");
    else request.log.info(fields, "request");
  });
} as FastifyPluginAsync<TimingOptions>);

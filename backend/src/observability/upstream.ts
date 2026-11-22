import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Time spent waiting on other services (the Supabase database, Supabase Auth, Firebase), recorded per request.
 *
 * Every outgoing call goes through `traced`, which times it and adds one entry to the trace of the request that made
 * it (found through AsyncLocalStorage, so no function in between has to pass anything along). The timing plugin
 * (plugins/timing.ts) then writes the request's total time next to the time spent waiting, which is what shows whether
 * a slow request was slow because of this server or because of what it called.
 *
 * Names are short labels, never URLs: no ids, tokens, emails or query strings reach the logs.
 */

export type UpstreamCall = {
  /** For example "db rpc app_create_nudge", "auth user", "fcm send". */
  name: string;
  ms: number;
  /** The HTTP status, or "error" when the call never got an answer (network failure, timeout). */
  status: number | "error";
};

export type UpstreamTrace = { calls: UpstreamCall[] };

const storage = new AsyncLocalStorage<UpstreamTrace>();

/** Runs `work` so that every traced call made inside it (also after awaits) is recorded in `trace`. */
export function runWithTrace<T>(trace: UpstreamTrace, work: () => T): T {
  return storage.run(trace, work);
}

/** A trace keeps at most this many calls, so a runaway loop cannot grow memory; the rest are only counted. */
const MAX_CALLS = 50;

function record(call: UpstreamCall, trace: UpstreamTrace | undefined) {
  if (trace && trace.calls.length < MAX_CALLS) trace.calls.push(call);
}

/** Wraps a fetch-like function so each call is timed and recorded in the current request's trace (if there is one). */
export function traced<A extends unknown[], R>(
  base: (...args: A) => Promise<R>,
  nameOf: (...args: A) => string,
  now: () => number = () => performance.now(),
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    const trace = storage.getStore();
    const started = now();
    let name: string;
    try {
      name = nameOf(...args);
    } catch {
      name = "unknown";
    }
    try {
      const response = await base(...args);
      // Read the status loosely: the Response types of different TypeScript / Node typings do not always line up.
      const status = (response as { status?: unknown } | null)?.status;
      record({ name, ms: Math.round(now() - started), status: typeof status === "number" ? status : 0 }, trace);
      return response;
    } catch (error) {
      record({ name, ms: Math.round(now() - started), status: "error" }, trace);
      throw error;
    }
  };
}

const urlOf = (input: unknown): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  const url = (input as { url?: unknown } | null)?.url;
  return typeof url === "string" ? url : "";
};

/**
 * The label for a call to Supabase, from the path alone. Only the kind of call and the function name are kept:
 * `/rest/v1/rpc/app_create_nudge` is "db rpc app_create_nudge", `/auth/v1/user` is "auth user", anything under
 * `/storage/v1` is "storage". Ids that appear in other paths are dropped.
 */
export function supabaseCallName(input: unknown): string {
  let path = "";
  try {
    path = new URL(urlOf(input)).pathname;
  } catch {
    return "supabase";
  }
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "rest" && parts[2] === "rpc" && parts[3]) return `db rpc ${parts[3].replace(/[^A-Za-z0-9_]/g, "").slice(0, 60)}`;
  if (parts[0] === "rest") return "db rest";
  if (parts[0] === "auth") return `auth ${parts[2] === "admin" ? "admin" : (parts[2] ?? "").replace(/[^A-Za-z0-9_]/g, "").slice(0, 30)}`.trim();
  if (parts[0] === "storage") return "storage";
  return "supabase";
}

/** The label for a call to Google (Firebase Cloud Messaging and the token exchange for it). */
export function googleCallName(input: unknown): string {
  try {
    const { hostname } = new URL(urlOf(input));
    if (hostname === "oauth2.googleapis.com") return "fcm token";
    if (hostname === "fcm.googleapis.com") return "fcm send";
    return hostname;
  } catch {
    return "google";
  }
}

export type TraceSummary = {
  /** Sum of the recorded calls. Calls that overlapped are counted separately, so this can exceed the request time. */
  upstreamMs: number;
  /** True when a call got no answer or an answer of 500 or more. */
  failed: boolean;
  /** The slowest calls first, as "db rpc app_get_plan 212ms" ("... failed" when it was not answered), at most `limit`. */
  slowest: string[];
  calls: number;
};

export function summarize(trace: UpstreamTrace, limit = 5): TraceSummary {
  const calls = trace.calls;
  const failedCall = (call: UpstreamCall) => call.status === "error" || call.status >= 500;
  return {
    upstreamMs: calls.reduce((sum, call) => sum + call.ms, 0),
    failed: calls.some(failedCall),
    calls: calls.length,
    slowest: [...calls].sort((left, right) => right.ms - left.ms).slice(0, limit).map((call) => `${call.name} ${call.ms}ms${failedCall(call) ? ` failed(${call.status})` : ""}`),
  };
}

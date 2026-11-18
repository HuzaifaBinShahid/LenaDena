import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import type { DatabaseHealth } from "../domain/push.js";
import type { PushSender } from "../push/fcm.js";
import { MemoryLedgerRepository } from "../repositories/MemoryLedgerRepository.js";

/** A repository whose answer to "is the database up and current?" the test chooses. */
class Probe extends MemoryLedgerRepository {
  calls = 0;
  outcome: DatabaseHealth | Error = { missing: [] };
  override async checkHealth(): Promise<DatabaseHealth> {
    this.calls += 1;
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}

const SECRET = "sb_secret_TOPSECRET_VALUE";
const supabase = { nodeEnv: "test", authMode: "supabase", supabaseUrl: "https://abc123.supabase.co", supabaseSecretKey: SECRET } as const;
const noopSender: PushSender = { send: async () => ({ delivered: 0, invalidTokens: [], failed: 0 }) };

const apps: FastifyInstance[] = [];
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

/** Auth answers `authStatus` (or the network fails when it is "network"). */
function authAnswers(authStatus: number | "network") {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
    if (authStatus === "network") throw new TypeError("fetch failed");
    return new Response("{}", { status: authStatus });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function freshApp(options: { probe?: Probe; config?: Record<string, unknown>; pushSender?: PushSender } = {}) {
  const probe = options.probe ?? new Probe();
  const { app } = await buildApp({ config: { ...supabase, ...options.config } as never, repository: probe, ...(options.pushSender ? { pushSender: options.pushSender } : {}) });
  apps.push(app);
  return { app, probe };
}
const ready = (app: FastifyInstance) => app.inject({ method: "GET", url: "/health/ready" });

describe("GET /health (liveness)", () => {
  it("stays cheap and always 200, and never touches the database or Auth", async () => {
    const fetchMock = authAnswers(500);
    const { app, probe } = await freshApp();
    probe.outcome = new Error("db down");
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
    expect(probe.calls).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /health/ready", () => {
  it("is ok when the database and Auth answer and every migration is applied", async () => {
    const fetchMock = authAnswers(200);
    const { app } = await freshApp();
    const response = await ready(app);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", checks: { database: "ok", auth: "ok", migrations: "ok", push: "off" } });
    expect(typeof response.json().ms).toBe("number");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://abc123.supabase.co/auth/v1/health");
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>).apikey).toBe(SECRET);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("says nothing about the project: no address, no key, no feature names", async () => {
    authAnswers(200);
    const probe = new Probe();
    probe.outcome = { missing: ["export", "payment_push"] };
    const { app } = await freshApp({ probe });
    const text = (await ready(app)).payload;
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("abc123");
    expect(text).not.toContain("payment_push");
  });

  it("is degraded (still 200) when a migration is not applied", async () => {
    authAnswers(200);
    const probe = new Probe();
    probe.outcome = { missing: ["payment_push"] };
    const { app } = await freshApp({ probe });
    const response = await ready(app);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "degraded", checks: { database: "ok", migrations: "behind" } });
  });

  it("stays ok but says 'unknown' while the health function itself is not installed", async () => {
    authAnswers(200);
    const probe = new Probe();
    probe.outcome = { missing: null };
    const { app } = await freshApp({ probe });
    expect((await ready(app)).json()).toMatchObject({ status: "ok", checks: { database: "ok", migrations: "unknown" } });
  });

  it("is 503 and down when the database does not answer", async () => {
    authAnswers(200);
    const probe = new Probe();
    probe.outcome = new Error("connection refused");
    const { app } = await freshApp({ probe });
    const response = await ready(app);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: "down", checks: { database: "down", auth: "ok", migrations: "unknown" } });
  });

  it("is 503 when Supabase Auth has a server error or cannot be reached", async () => {
    authAnswers(502);
    expect((await ready((await freshApp()).app)).statusCode).toBe(503);
    authAnswers("network");
    const response = await ready((await freshApp()).app);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: "down", checks: { database: "ok", auth: "down" } });
  });

  it("treats any answer below 500 from Auth as up, whatever it thinks of the key", async () => {
    authAnswers(401);
    expect((await ready((await freshApp()).app)).json()).toMatchObject({ status: "ok", checks: { auth: "ok" } });
  });

  it("keeps the answer for 10 seconds so frequent callers cannot load the database, then looks again", async () => {
    authAnswers(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    const { app, probe } = await freshApp();
    await ready(app);
    await ready(app);
    expect(probe.calls).toBe(1);
    vi.setSystemTime(Date.now() + 11_000);
    await ready(app);
    expect(probe.calls).toBe(2);
  });

  it("asks once when many callers arrive together", async () => {
    authAnswers(200);
    const { app, probe } = await freshApp();
    const answers = await Promise.all(Array.from({ length: 6 }, () => ready(app)));
    expect(answers.every((answer) => answer.statusCode === 200)).toBe(true);
    expect(probe.calls).toBe(1);
  });

  it("reports whether pushes are on, off, or misconfigured (and a bad key counts as degraded)", async () => {
    authAnswers(200);
    expect((await ready((await freshApp({ pushSender: noopSender })).app)).json().checks.push).toBe("on");
    expect((await ready((await freshApp()).app)).json().checks.push).toBe("off");
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "this is not a service account key");
    const invalid = await ready((await freshApp()).app);
    expect(invalid.json()).toMatchObject({ status: "degraded", checks: { push: "invalid" } });
  });

  it("is ok in demo mode without calling anything", async () => {
    const fetchMock = authAnswers(500);
    const probe = new Probe();
    probe.outcome = new Error("never asked");
    const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo" }, repository: probe });
    apps.push(app);
    const response = await ready(app);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", checks: { database: "demo", auth: "demo", migrations: "demo" } });
    expect(probe.calls).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is public: no sign-in is needed", async () => {
    authAnswers(200);
    const { app } = await freshApp();
    expect((await ready(app)).statusCode).toBe(200);
  });
});

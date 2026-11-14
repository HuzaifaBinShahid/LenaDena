import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import type { NotificationRunner } from "../notifications/runner.js";

const SECRET = "s3cret-".repeat(8);
const openApps: FastifyInstance[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

async function appWith(notificationsCronSecret: string | undefined, runner?: NotificationRunner) {
  const { app } = await buildApp({
    config: { nodeEnv: "test", authMode: "demo", ...(notificationsCronSecret ? { notificationsCronSecret } : {}) },
    ...(runner ? { notificationRunner: runner } : {}),
  });
  openApps.push(app);
  return app;
}

const run = (app: FastifyInstance, authorization?: string) =>
  app.inject({ method: "POST", url: "/internal/notifications/run", ...(authorization ? { headers: { authorization } } : {}) });

describe("POST /internal/notifications/run", () => {
  it("does not exist unless a scheduler secret is configured", async () => {
    const app = await appWith(undefined);
    expect((await run(app, `Bearer ${SECRET}`)).statusCode).toBe(404);
  });

  it("refuses a missing, wrong or differently-shaped secret, and never runs the worker for them", async () => {
    const runBatch = vi.fn(async () => ({ claimed: 0, sent: 0, failed: 0, skipped: 0 }));
    const app = await appWith(SECRET, { runBatch });
    for (const header of [undefined, "Bearer wrong", `Bearer ${SECRET}x`, `Basic ${SECRET}`, SECRET]) {
      const response = await run(app, header);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: "unauthorized" });
    }
    expect(runBatch).not.toHaveBeenCalled();
  });

  it("runs one small pass for the scheduler and reports what it did", async () => {
    const runBatch = vi.fn(async () => ({ claimed: 3, sent: 2, failed: 1, skipped: 0 }));
    const app = await appWith(SECRET, { runBatch });
    const response = await run(app, `Bearer ${SECRET}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ claimed: 3, sent: 2, failed: 1, skipped: 0 });
    expect(runBatch).toHaveBeenCalledWith({ limit: 3 });
  });

  it("only answers POST", async () => {
    const app = await appWith(SECRET, { runBatch: async () => ({ claimed: 0, sent: 0, failed: 0, skipped: 0 }) });
    expect((await app.inject({ method: "GET", url: "/internal/notifications/run", headers: { authorization: `Bearer ${SECRET}` } })).statusCode).toBe(404);
  });

  it("says so, without leaking details, when the server has no email settings", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const app = await appWith(SECRET);
    const response = await run(app, `Bearer ${SECRET}`);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "notifications_not_configured" });
  });

  it("refuses to start with a short secret", async () => {
    await expect(buildApp({ config: { nodeEnv: "test", authMode: "demo", notificationsCronSecret: "too-short" } })).rejects.toThrow("NOTIFICATIONS_CRON_SECRET must be at least 32 characters");
  });

  it("is not behind the /v1 sign-in, so only the secret matters (and a sign-in alone is not enough)", async () => {
    const runBatch = vi.fn(async () => ({ claimed: 0, sent: 0, failed: 0, skipped: 0 }));
    const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo", notificationsCronSecret: SECRET }, notificationRunner: { runBatch } });
    openApps.push(app);
    const withUserOnly = await app.inject({ method: "POST", url: "/internal/notifications/run", headers: { "x-user-id": "demo-user" } });
    expect(withUserOnly.statusCode).toBe(401);
    expect(runBatch).not.toHaveBeenCalled();
  });
});

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { MemoryLedgerRepository } from "../repositories/MemoryLedgerRepository.js";

type FakeUser = { id: string; email: string; email_confirmed_at: string | null };

/** Speaks just enough of Supabase Auth (GET /auth/v1/user) for the real supabase-js client. */
class FakeGoTrue {
  readonly users = new Map<string, FakeUser>();
  down = false;
  url = "";
  private readonly server: Server;

  constructor() {
    this.server = createServer((request, response) => {
      const send = (status: number, body: unknown) => {
        response.statusCode = status;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(body));
      };
      if (this.down) return send(500, { code: 500, error_code: "unexpected_failure", msg: "boom" });
      if (request.method === "GET" && request.url === "/auth/v1/user") {
        const token = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
        const user = this.users.get(token);
        if (!user) return send(401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
        return send(200, { aud: "authenticated", role: "authenticated", ...user, app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" });
      }
      return send(404, { msg: "not found" });
    });
  }

  async start() {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  stop() {
    return new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}

const running: Array<{ stop: () => Promise<unknown> }> = [];

async function setup() {
  const auth = await new FakeGoTrue().start();
  const { app } = await buildApp({
    config: { nodeEnv: "test", authMode: "supabase", supabaseUrl: auth.url, supabaseSecretKey: "test-secret" },
    // The memory ledger knows demo-user, so a verified token for that id can read its plan.
    repository: new MemoryLedgerRepository(),
  });
  running.push(auth, { stop: () => app.close() });
  return { auth, app };
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((item) => item.stop()));
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("API sign-in (Supabase tokens)", () => {
  it("lets a confirmed account read its data", async () => {
    const { auth, app } = await setup();
    auth.users.set("good-token", { id: "demo-user", email: "huzaifa@example.com", email_confirmed_at: "2026-11-01T00:00:00Z" });
    const response = await app.inject({ method: "GET", url: "/v1/me/plan", headers: bearer("good-token") });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.id).toBe("demo-user");
  });

  it("refuses an account whose email nobody has confirmed, so invites tied to that address stay safe", async () => {
    const { auth, app } = await setup();
    auth.users.set("unconfirmed", { id: "demo-user", email: "victim@example.com", email_confirmed_at: null });
    const response = await app.inject({ method: "GET", url: "/v1/me/plan", headers: bearer("unconfirmed") });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "email_not_confirmed" });
  });

  it("answers 401 without a token, with a bad token, and with a token that is not a Bearer", async () => {
    const { app } = await setup();
    expect((await app.inject({ method: "GET", url: "/v1/me/plan" })).statusCode).toBe(401);
    const bad = await app.inject({ method: "GET", url: "/v1/me/plan", headers: bearer("who-knows") });
    expect(bad.statusCode).toBe(401);
    expect(bad.json()).toMatchObject({ code: "unauthorized" });
    expect((await app.inject({ method: "GET", url: "/v1/me/plan", headers: { authorization: "Basic abc" } })).statusCode).toBe(401);
  });

  it("does not tell a client its session is over when Supabase Auth is down", async () => {
    const { auth, app } = await setup();
    auth.users.set("good-token", { id: "demo-user", email: "huzaifa@example.com", email_confirmed_at: "2026-11-01T00:00:00Z" });
    auth.down = true;
    const response = await app.inject({ method: "GET", url: "/v1/me/plan", headers: bearer("good-token") });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "auth_unavailable" });
  });

  it("has no public sign-in routes: the old email-only ones are gone and answer 401 like any /v1 route", async () => {
    const { app } = await setup();
    expect((await app.inject({ method: "GET", url: "/v1/auth/options" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/v1/auth/instant", payload: { mode: "signin", email: "sara@example.com" } })).statusCode).toBe(401);
  });

  it("keeps the health check public", async () => {
    const { app } = await setup();
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
  });
});

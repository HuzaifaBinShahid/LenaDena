import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { MemoryLedgerRepository } from "../repositories/MemoryLedgerRepository.js";

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
/** A token shaped like Supabase's (the API reads its `amr` claim after Supabase has vouched for it). */
const token = (amr: Array<{ method: string; timestamp: number }> | undefined, tag: string) =>
  `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "demo-user", aud: "authenticated", ...(amr ? { amr } : {}) })}.${tag}`;
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Speaks just enough Supabase Auth (GET /auth/v1/user) for the real supabase-js client. */
class FakeGoTrue {
  readonly tokens = new Set<string>();
  url = "";
  private readonly server: Server;

  constructor() {
    this.server = createServer((request, response) => {
      const bearer = (request.headers.authorization ?? "").replace(/^Bearer /, "");
      const known = request.method === "GET" && request.url === "/auth/v1/user" && this.tokens.has(bearer);
      response.statusCode = known ? 200 : 401;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(known
        ? { aud: "authenticated", role: "authenticated", id: "demo-user", email: "huzaifa@example.com", email_confirmed_at: "2026-11-01T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-11-01T00:00:00Z" }
        : { code: 401, error_code: "bad_jwt", msg: "invalid JWT" }));
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
afterEach(async () => {
  await Promise.all(running.splice(0).map((item) => item.stop()));
});

async function setup() {
  const auth = await new FakeGoTrue().start();
  const repository = new MemoryLedgerRepository();
  const deleteAccount = vi.spyOn(repository, "deleteAccount");
  const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "supabase", supabaseUrl: auth.url, supabaseSecretKey: "test-secret" }, repository });
  running.push(auth, { stop: () => app.close() });
  return { auth, app, deleteAccount };
}

const remove = (app: FastifyInstance, bearer: string | undefined, payload: unknown = { confirm: "DELETE" }) =>
  app.inject({ method: "POST", url: "/v1/me/delete", ...(bearer ? { headers: { authorization: `Bearer ${bearer}` } } : {}), payload: payload as never });

describe("POST /v1/me/delete", () => {
  it("deletes the account after a password sign-in a moment ago", async () => {
    const { auth, app, deleteAccount } = await setup();
    const fresh = token([{ method: "password", timestamp: nowSeconds() - 20 }], "fresh");
    auth.tokens.add(fresh);
    const response = await remove(app, fresh);
    expect(response.statusCode).toBe(204);
    expect(deleteAccount).toHaveBeenCalledExactlyOnceWith("demo-user");
  });

  it("asks for the password again when the sign-in is older than ten minutes", async () => {
    const { auth, app, deleteAccount } = await setup();
    const stale = token([{ method: "password", timestamp: nowSeconds() - 11 * 60 }], "stale");
    auth.tokens.add(stale);
    const response = await remove(app, stale);
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "recent_sign_in_required" });
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("does not count a session that was never opened with a password, or a refreshed token with no such record", async () => {
    // One app per case: the route allows only a few tries a minute, which is tested on its own below.
    const cases: Array<[string, Array<{ method: string; timestamp: number }> | undefined]> = [["no-amr", undefined], ["otp-only", [{ method: "otp", timestamp: nowSeconds() }]], ["empty", []]];
    for (const [name, amr] of cases) {
      const { auth, app, deleteAccount } = await setup();
      const odd = token(amr, name);
      auth.tokens.add(odd);
      expect((await remove(app, odd)).statusCode).toBe(403);
      expect(deleteAccount).not.toHaveBeenCalled();
    }
    // A token that is not even shaped like a JWT (Supabase vouched for it, but there is no claim to read).
    const { auth, app, deleteAccount } = await setup();
    auth.tokens.add("opaque-token");
    expect((await remove(app, "opaque-token")).statusCode).toBe(403);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("is not fooled by a future timestamp", async () => {
    const { auth, app, deleteAccount } = await setup();
    const future = token([{ method: "password", timestamp: nowSeconds() + 3600 }], "future");
    auth.tokens.add(future);
    expect((await remove(app, future)).statusCode).toBe(403);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("needs the exact confirmation word", async () => {
    for (const payload of [{}, { confirm: "delete" }, { confirm: "YES" }, { confirm: true }, { confirm: " DELETE" }]) {
      const { auth, app, deleteAccount } = await setup();
      const fresh = token([{ method: "password", timestamp: nowSeconds() }], "fresh");
      auth.tokens.add(fresh);
      const response = await remove(app, fresh, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "validation_error" });
      expect(deleteAccount).not.toHaveBeenCalled();
    }
  });

  it("needs a sign-in at all", async () => {
    const { app, deleteAccount } = await setup();
    expect((await remove(app, undefined)).statusCode).toBe(401);
    expect((await remove(app, "not-a-known-token")).statusCode).toBe(401);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("is limited to a few tries a minute", async () => {
    const { auth, app } = await setup();
    const fresh = token([{ method: "password", timestamp: nowSeconds() }], "fresh");
    auth.tokens.add(fresh);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) statuses.push((await remove(app, fresh, {})).statusCode);
    expect(statuses.at(-1)).toBe(429);
  });

  it("has no sign-in to check in demo mode, and removes the private data there", async () => {
    const repository = new MemoryLedgerRepository();
    const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo" }, repository });
    running.push({ stop: () => app.close() });
    const before = await app.inject({ method: "GET", url: "/v1/me/plan", headers: { "x-user-id": "demo-user" } });
    expect(before.json().transactions.length).toBeGreaterThan(0);
    const response = await app.inject({ method: "POST", url: "/v1/me/delete", headers: { "x-user-id": "demo-user" }, payload: { confirm: "DELETE" } });
    expect(response.statusCode).toBe(204);
    const after = await app.inject({ method: "GET", url: "/v1/me/plan", headers: { "x-user-id": "demo-user" } });
    expect(after.json().people).toEqual([]);
    expect(after.json().user.name).toBe("Deleted user");
  });
});

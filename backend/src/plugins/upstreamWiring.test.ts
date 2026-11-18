import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import type { UpstreamCall } from "../observability/upstream.js";

const USER = "8a1f5c2e-4b3d-4e6f-8a7b-9c0d1e2f3a4b";

/** A stand-in for Supabase that answers just what signing in and loading the plan need, and counts nothing else. */
async function fakeSupabase() {
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://fake").pathname;
    request.resume();
    const send = (status: number, body?: unknown) => {
      response.statusCode = status;
      response.setHeader("content-type", "application/json");
      response.end(body === undefined ? undefined : JSON.stringify(body));
    };
    if (path === "/auth/v1/user") return send(200, { id: USER, email: "h@example.com", email_confirmed_at: "2026-01-01T00:00:00Z", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
    if (path === "/rest/v1/rpc/app_touch_profile") return send(204);
    if (path === "/rest/v1/rpc/app_get_plan") return send(200, { user: { id: USER, name: "Huzaifa", email: "h@example.com" }, totals: [], groups: [], reviews: [], claims: [], activity: [] });
    if (path === "/rest/v1/rpc/app_get_transactions") return send(200, []);
    if (path === "/rest/v1/rpc/app_get_people") return send(200, []);
    return send(500, { message: `unexpected ${path}` });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, stop: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

const running: Array<{ stop: () => Promise<unknown> }> = [];
afterEach(async () => { await Promise.all(running.splice(0).map((item) => item.stop())); });

describe("timing of calls to Supabase", () => {
  it("records the sign-in check and each database call a real request makes, under short names", async () => {
    const fake = await fakeSupabase();
    running.push(fake);
    const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "supabase", supabaseUrl: fake.url, supabaseSecretKey: "test-secret" } });
    running.push({ stop: () => app.close() });
    let calls: UpstreamCall[] = [];
    app.addHook("onResponse", async (request) => { calls = [...request.upstream.calls]; });
    const response = await app.inject({ method: "GET", url: "/v1/me/plan", headers: { authorization: "Bearer some.jwt.token" } });
    expect(response.statusCode).toBe(200);
    const names = calls.map((call) => call.name);
    expect(names).toContain("auth user");
    expect(names).toContain("db rpc app_get_plan");
    expect(calls.every((call) => call.status === 200 || call.status === 204)).toBe(true);
    expect(calls.every((call) => typeof call.ms === "number" && call.ms >= 0)).toBe(true);
    // Short labels only: nothing of the address, the token or the user's id.
    expect(JSON.stringify(calls)).not.toMatch(/127\.0\.0\.1|some\.jwt|8a1f5c2e/);
  });
});

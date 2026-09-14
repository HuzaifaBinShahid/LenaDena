import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import type { AppConfig } from "../config.js";
import type { InstantAccount, InstantAuthGateway } from "../auth/InstantAuthGateway.js";
import { isTrustedAuthOrigin } from "./auth.js";

class FakeGateway implements InstantAuthGateway {
  readonly accounts = new Map<string, InstantAccount>([["sara@example.com", { id: "sara", name: "Sara" }]]);
  readonly created: Array<{ email: string; name: string }> = [];
  readonly issued: string[] = [];
  failure: Error | null = null;

  async createAccount(email: string, name: string) {
    if (this.failure) throw this.failure;
    if (this.accounts.has(email)) return null;
    const account = { id: `user-${this.accounts.size + 1}`, name };
    this.accounts.set(email, account);
    this.created.push({ email, name });
    return account;
  }

  async issueSignInToken(email: string) {
    if (this.failure) throw this.failure;
    const account = this.accounts.get(email);
    if (!account) return null;
    this.issued.push(email);
    return { tokenHash: `hash-for-${email}`, account };
  }
}

const supabaseConfig: Partial<AppConfig> = {
  nodeEnv: "test",
  authMode: "supabase",
  supabaseUrl: "https://example.supabase.co",
  supabaseSecretKey: "test-secret",
  allowInstantAuth: true,
};

const openApps: FastifyInstance[] = [];

async function createApp(config: Partial<AppConfig> = supabaseConfig, gateway = new FakeGateway()) {
  const { app } = await buildApp({ config, instantAuthGateway: gateway });
  openApps.push(app);
  return { app, gateway };
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("instant email authentication", () => {
  it("stays off unless the development flag is set", async () => {
    const { app } = await createApp({ ...supabaseConfig, allowInstantAuth: false });
    expect((await app.inject({ method: "GET", url: "/v1/auth/options" })).json()).toEqual({ instantAuth: false });
    const response = await app.inject({ method: "POST", url: "/v1/auth/instant", payload: { mode: "signin", email: "sara@example.com" } });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "instant_auth_disabled" });
  });

  it("can never be enabled in production", async () => {
    const { app, gateway } = await createApp({ ...supabaseConfig, nodeEnv: "production" });
    expect((await app.inject({ method: "GET", url: "/v1/auth/options" })).json()).toEqual({ instantAuth: false });
    const response = await app.inject({ method: "POST", url: "/v1/auth/instant", payload: { mode: "signin", email: "sara@example.com" } });
    expect(response.statusCode).toBe(404);
    expect(gateway.issued).toEqual([]);
  });

  it("creates an account from a name and email without email confirmation", async () => {
    const { app, gateway } = await createApp();
    expect((await app.inject({ method: "GET", url: "/v1/auth/options" })).json()).toEqual({ instantAuth: true });
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/instant",
      payload: { mode: "signup", email: "New.Person@Example.com", name: "  Ayesha Khan " },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tokenHash: "hash-for-new.person@example.com", created: true, name: "Ayesha Khan" });
    expect(gateway.created).toEqual([{ email: "new.person@example.com", name: "Ayesha Khan" }]);
  });

  it("requires a name to create an account", async () => {
    const { app, gateway } = await createApp();
    for (const payload of [{ mode: "signup", email: "new@example.com" }, { mode: "signup", email: "new@example.com", name: "   " }]) {
      const response = await app.inject({ method: "POST", url: "/v1/auth/instant", payload });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "name_required" });
    }
    expect(gateway.created).toEqual([]);
  });

  it("does not create a second account for an email that is already registered", async () => {
    const { app, gateway } = await createApp();
    const response = await app.inject({ method: "POST", url: "/v1/auth/instant", payload: { mode: "signup", email: "sara@example.com", name: "Someone else" } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "account_exists" });
    expect(gateway.issued).toEqual([]);
  });

  it("signs in an existing account with only its email", async () => {
    const { app, gateway } = await createApp();
    const response = await app.inject({ method: "POST", url: "/v1/auth/instant", payload: { mode: "signin", email: "SARA@example.com" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tokenHash: "hash-for-sara@example.com", created: false, name: "Sara" });
    expect(gateway.created).toEqual([]);
  });

  it("refuses to sign in an unknown email instead of silently creating an account", async () => {
    const { app, gateway } = await createApp();
    const response = await app.inject({ method: "POST", url: "/v1/auth/instant", payload: { mode: "signin", email: "typo@example.com" } });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "account_not_found" });
    expect(gateway.issued).toEqual([]);
    expect(gateway.accounts.has("typo@example.com")).toBe(false);
  });

  it("rejects browser requests from other sites but allows local Expo web", async () => {
    const { app } = await createApp();
    const payload = { mode: "signin", email: "sara@example.com" };
    const crossSite = await app.inject({ method: "POST", url: "/v1/auth/instant", payload, headers: { origin: "https://attacker.example" } });
    expect(crossSite.statusCode).toBe(403);
    expect(crossSite.json()).toMatchObject({ code: "origin_not_allowed" });
    const localWeb = await app.inject({ method: "POST", url: "/v1/auth/instant", payload, headers: { origin: "http://localhost:8081" } });
    expect(localWeb.statusCode).toBe(200);
  });

  it("reports provider failures with a stable error code", async () => {
    const gateway = new FakeGateway();
    gateway.failure = new Error("connection reset");
    const { app } = await createApp(supabaseConfig, gateway);
    const response = await app.inject({ method: "POST", url: "/v1/auth/instant", payload: { mode: "signin", email: "sara@example.com" } });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ code: "auth_provider_error" });
    expect(response.json().message).not.toContain("connection reset");
  });

  it("keeps financial routes behind bearer authentication", async () => {
    const { app } = await createApp();
    const response = await app.inject({ method: "GET", url: "/v1/me/plan" });
    expect(response.statusCode).toBe(401);
  });

  it("answers 503, not 401, when Supabase Auth cannot be reached to check a token", async () => {
    // Nothing listens on port 9, so the token check fails at the network layer.
    const { app } = await createApp({ ...supabaseConfig, supabaseUrl: "http://127.0.0.1:9" });
    const response = await app.inject({ method: "GET", url: "/v1/me/plan", headers: { authorization: "Bearer some.jwt.token" } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "auth_unavailable" });
  });
});

describe("isTrustedAuthOrigin", () => {
  it("trusts native clients and loopback pages only", () => {
    expect(isTrustedAuthOrigin(undefined, "*")).toBe(true);
    expect(isTrustedAuthOrigin("http://localhost:8081", "*")).toBe(true);
    expect(isTrustedAuthOrigin("http://127.0.0.1:19006", "*")).toBe(true);
    expect(isTrustedAuthOrigin("http://[::1]:8081", "*")).toBe(true);
    expect(isTrustedAuthOrigin("https://lenadena.app", "*")).toBe(false);
    expect(isTrustedAuthOrigin("https://lenadena.app", "https://lenadena.app, https://staging.lenadena.app")).toBe(true);
    expect(isTrustedAuthOrigin("not a url", "*")).toBe(false);
  });
});

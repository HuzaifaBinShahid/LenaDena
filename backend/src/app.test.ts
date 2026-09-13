import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";

const openApps: FastifyInstance[] = [];

async function createApp() {
  const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo" } });
  openApps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("OweYaar API", () => {
  it("reports health without authentication", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", version: "0.1.0" });
  });

  it("returns the member-specific plan", async () => {
    const app = await createApp();
    const response = await app.inject({ method: "GET", url: "/v1/me/plan", headers: { "x-user-id": "demo-user" } });
    expect(response.statusCode).toBe(200);
    expect(response.json().totals).toEqual([{ currency: "PKR", oweMinor: 240000, owedMinor: 110000 }]);
    expect(response.json().groups).toHaveLength(2);
    expect(response.json().transactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "expense-1", amountMinor: 240000, direction: "outgoing" }),
      expect.objectContaining({ id: "expense-2", amountMinor: 110000, direction: "incoming" }),
    ]));
  });

  it("returns the shared error contract when authentication is missing", async () => {
    const { app } = await buildApp({
      config: {
        nodeEnv: "test",
        authMode: "supabase",
        supabaseUrl: "https://example.supabase.co",
        supabaseSecretKey: "test-secret",
      },
    });
    openApps.push(app);
    const response = await app.inject({ method: "GET", url: "/v1/me/plan" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "unauthorized", message: "A bearer token is required" });
    expect(response.json().requestId).toBeTypeOf("string");
  });

  it("replays a group mutation safely", async () => {
    const app = await createApp();
    const payload = { name: "Murree plan", currency: "PKR", accent: "#35C4A5", inviteEmails: ["new@example.com"] };
    const headers = { "x-user-id": "demo-user", "idempotency-key": "group-create-0001" };
    const first = await app.inject({ method: "POST", url: "/v1/groups", headers, payload });
    const second = await app.inject({ method: "POST", url: "/v1/groups", headers, payload });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().id).toBe(first.json().id);
  });

  it("rejects expense shares that do not equal the total", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/expenses",
      headers: { "x-user-id": "demo-user", "idempotency-key": "expense-create-0001" },
      payload: {
        groupId: "weekend-crew",
        eventName: "Tea",
        eventDate: "2026-09-12",
        amountMinor: 10000,
        paidByMemberId: "demo-user",
        splitMethod: "exact",
        shares: [
          { memberId: "demo-user", amountMinor: 5000 },
          { memberId: "sara", amountMinor: 4000 },
        ],
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().message).toContain("add up exactly");
  });

  it("creates and settles an individual obligation without a group", async () => {
    const app = await createApp();
    const created = await app.inject({
      method: "POST",
      url: "/v1/personal-transactions",
      headers: { "x-user-id": "demo-user", "idempotency-key": "personal-create-0001" },
      payload: {
        title: "Fuel",
        eventDate: "2026-09-13",
        amountMinor: 500000,
        currency: "PKR",
        kind: "expense",
        direction: "outgoing",
        counterparty: "Ali",
      },
    });
    expect(created.statusCode).toBe(201);
    const transactionId = created.json().id;
    const openPlan = await app.inject({ method: "GET", url: "/v1/me/plan", headers: { "x-user-id": "demo-user" } });
    expect(openPlan.json().transactions[0]).toMatchObject({
      id: transactionId,
      title: "Fuel",
      source: "personal",
      kind: "expense",
      direction: "outgoing",
      counterparty: "Ali",
      status: "open",
    });

    const privateAttempt = await app.inject({
      method: "POST",
      url: `/v1/personal-transactions/${transactionId}/settle`,
      headers: { "x-user-id": "hamza", "idempotency-key": "personal-settle-private-0001" },
      payload: {},
    });
    expect(privateAttempt.statusCode).toBe(404);

    const settled = await app.inject({
      method: "POST",
      url: `/v1/personal-transactions/${transactionId}/settle`,
      headers: { "x-user-id": "demo-user", "idempotency-key": "personal-settle-0001" },
      payload: {},
    });
    expect(settled.statusCode).toBe(204);

    const settledPlan = await app.inject({ method: "GET", url: "/v1/me/plan", headers: { "x-user-id": "demo-user" } });
    expect(settledPlan.json().transactions[0]).toMatchObject({ id: transactionId, status: "settled" });
    expect(settledPlan.json().transactions[0].settledAt).toBeTypeOf("string");
  });

  it("requires a person for every individual obligation", async () => {
    const app = await createApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/personal-transactions",
      headers: { "x-user-id": "demo-user", "idempotency-key": "personal-create-0002" },
      payload: {
        title: "Short loan",
        eventDate: "2026-09-13",
        amountMinor: 100000,
        currency: "PKR",
        kind: "loan",
        direction: "outgoing",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "validation_error", message: "The request did not match the API contract" });
  });

  it("allows only the recipient to confirm a settlement", async () => {
    const app = await createApp();
    const forbidden = await app.inject({
      method: "POST",
      url: "/v1/settlements/review-1/confirm",
      headers: { "x-user-id": "hamza", "idempotency-key": "confirm-review-0001" },
      payload: {},
    });
    expect(forbidden.statusCode).toBe(403);
    const confirmed = await app.inject({
      method: "POST",
      url: "/v1/settlements/review-1/confirm",
      headers: { "x-user-id": "demo-user", "idempotency-key": "confirm-review-0002" },
      payload: {},
    });
    expect(confirmed.statusCode).toBe(204);
  });

  it("reserves an amount while a payment claim is under review", async () => {
    const app = await createApp();
    const payload = { groupId: "weekend-crew", recipientMemberId: "sara", amountMinor: 240000 };
    const first = await app.inject({ method: "POST", url: "/v1/settlements", headers: { "x-user-id": "demo-user", "idempotency-key": "claim-reserve-0001" }, payload });
    const second = await app.inject({ method: "POST", url: "/v1/settlements", headers: { "x-user-id": "demo-user", "idempotency-key": "claim-reserve-0002" }, payload });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(409);
  });

  it("creates a single-use invite and joins a new member", async () => {
    const app = await createApp();
    const created = await app.inject({
      method: "POST",
      url: "/v1/groups/weekend-crew/invites",
      headers: { "x-user-id": "demo-user" },
      payload: {},
    });
    expect(created.statusCode).toBe(201);
    const token = String(created.json().url).split("/").pop();
    const accepted = await app.inject({
      method: "POST",
      url: `/v1/invites/${token}/accept`,
      headers: { "x-user-id": "new-friend" },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ id: "weekend-crew", role: "member" });
  });
});

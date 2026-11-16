import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

// Demo mode: "demo-user" owns both seeded groups. expense-1 (Weekend crew) was paid by sara; expense-2 (Flat bills)
// was paid by demo-user and shared with hamza. personal-1 / personal-2 are demo-user's balances with Ali.
const ME = { "x-user-id": "demo-user" };
const HAMZA = { "x-user-id": "hamza" };
const SARA = { "x-user-id": "sara" };
const ALI = "5d1c9a7e-3b2f-4e8a-9c6d-2f7b8e4a1c03";

const openApps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});
async function freshApp() {
  const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo" } });
  openApps.push(app);
  return app;
}

let counter = 0;
const key = () => ({ "idempotency-key": `edit-test-key-${String(++counter).padStart(4, "0")}` });
const expenseBody = (over: Record<string, unknown> = {}) => ({
  eventName: "Internet and gas",
  eventDate: "2026-09-06",
  note: "Corrected",
  amountMinor: 300000,
  splitMethod: "exact",
  shares: [{ memberId: "demo-user", amountMinor: 150000 }, { memberId: "hamza", amountMinor: 150000 }],
  ...over,
});
const entryBody = (over: Record<string, unknown> = {}) => ({
  title: "Coffee and snacks",
  eventDate: "2026-09-14",
  amountMinor: 200000,
  currency: "PKR",
  kind: "expense",
  direction: "outgoing",
  counterparty: "Ali",
  personId: ALI,
  ...over,
});

describe("editing an expense", () => {
  it("shows one expense in full and what the caller may do to it", async () => {
    const app = await freshApp();
    const mine = await app.inject({ method: "GET", url: "/v1/expenses/expense-2", headers: ME });
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toMatchObject({ id: "expense-2", groupId: "flat-bills", eventName: "September internet", amountMinor: 220000, splitMethod: "equal", paidByMemberId: "demo-user", canEdit: true, canDelete: true });
    expect(mine.json().shares).toHaveLength(2);
    // sara paid expense-1: demo-user owns the group, so may delete it but not edit it.
    const theirs = await app.inject({ method: "GET", url: "/v1/expenses/expense-1", headers: ME });
    expect(theirs.json()).toMatchObject({ canEdit: false, canDelete: true });
  });

  it("is 'not found' for someone outside the group and for an unknown id, never 'forbidden'", async () => {
    const app = await freshApp();
    expect((await app.inject({ method: "GET", url: "/v1/expenses/expense-2", headers: SARA })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/v1/expenses/nope", headers: ME })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: "/v1/expenses/expense-2", headers: { ...SARA, ...key() }, payload: expenseBody() })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: "/v1/expenses/expense-2", headers: SARA })).statusCode).toBe(404);
  });

  it("replaces the details and split, moves the balance and records it in the group's activity", async () => {
    const app = await freshApp();
    const before = (await app.inject({ method: "GET", url: "/v1/me/plan", headers: ME })).json();
    const response = await app.inject({ method: "PATCH", url: "/v1/expenses/expense-2", headers: { ...ME, ...key() }, payload: expenseBody() });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: "expense-2" });

    const detail = (await app.inject({ method: "GET", url: "/v1/expenses/expense-2", headers: ME })).json();
    expect(detail).toMatchObject({ eventName: "Internet and gas", eventDate: "2026-09-06", note: "Corrected", amountMinor: 300000, splitMethod: "exact", groupId: "flat-bills", paidByMemberId: "demo-user" });
    expect(detail.editedAt).toBeTruthy();

    const after = (await app.inject({ method: "GET", url: "/v1/me/plan", headers: ME })).json();
    const group = (plan: typeof before) => plan.groups.find((item: { id: string }) => item.id === "flat-bills");
    expect(group(after).balanceMinor).toBe(group(before).balanceMinor + 40000);
    const row = after.transactions.find((item: { id: string }) => item.id === "expense-2");
    expect(row).toMatchObject({ title: "Internet and gas", amountMinor: 150000, canEdit: true, canDelete: true });
    expect(row.editedAt).toBeTruthy();
    const event = after.activity.find((item: { detail: string }) => item.detail.includes("edited this expense"));
    expect(event).toMatchObject({ title: "Internet and gas", tone: "neutral" });
    expect(event.detail).toBe("Huzaifa edited this expense. It is now 3000 PKR");
  });

  it("repeating the same request changes nothing twice", async () => {
    const app = await freshApp();
    const headers = { ...ME, ...key() };
    const first = await app.inject({ method: "PATCH", url: "/v1/expenses/expense-2", headers, payload: expenseBody() });
    const replay = await app.inject({ method: "PATCH", url: "/v1/expenses/expense-2", headers, payload: expenseBody() });
    expect(replay.json()).toEqual(first.json());
    const plan = (await app.inject({ method: "GET", url: "/v1/me/plan", headers: ME })).json();
    expect(plan.activity.filter((item: { detail: string }) => item.detail.includes("edited this expense"))).toHaveLength(1);
  });

  it("only whoever added or paid it may edit; the owner may delete but not edit", async () => {
    const app = await freshApp();
    // Hamza shares expense-2 but did not add or pay it.
    const refused = await app.inject({ method: "PATCH", url: "/v1/expenses/expense-2", headers: { ...HAMZA, ...key() }, payload: expenseBody() });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ code: "forbidden", message: expect.stringContaining("Only the person who added or paid") });
    // demo-user owns Weekend crew but sara paid expense-1.
    const owner = await app.inject({ method: "PATCH", url: "/v1/expenses/expense-1", headers: { ...ME, ...key() }, payload: expenseBody({ amountMinor: 480000, splitMethod: "equal", shares: [{ memberId: "demo-user", amountMinor: 240000 }, { memberId: "sara", amountMinor: 240000 }] }) });
    expect(owner.statusCode).toBe(403);
    const detail = (await app.inject({ method: "GET", url: "/v1/expenses/expense-2", headers: ME })).json();
    expect(detail.eventName).toBe("September internet");
  });

  it("refuses a split that does not add up, someone outside the group and a bad request, and changes nothing", async () => {
    const app = await freshApp();
    const send = (payload: unknown, headers: Record<string, string> = key()) => app.inject({ method: "PATCH", url: "/v1/expenses/expense-2", headers: { ...ME, ...headers }, payload: payload as Record<string, unknown> });
    expect((await send(expenseBody({ amountMinor: 300000, shares: [{ memberId: "demo-user", amountMinor: 1 }] }))).statusCode).toBe(400);
    expect((await send(expenseBody({ shares: [{ memberId: "sara", amountMinor: 300000 }] }))).statusCode).toBe(403);
    const missing = await send({ ...expenseBody(), eventName: undefined });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().code).toBe("validation_error");
    expect((await send(expenseBody({ amountMinor: 0 }))).statusCode).toBe(400);
    expect((await send(expenseBody(), {})).statusCode).toBe(400);
    const detail = (await app.inject({ method: "GET", url: "/v1/expenses/expense-2", headers: ME })).json();
    expect(detail).toMatchObject({ eventName: "September internet", amountMinor: 220000 });
    expect(detail.editedAt).toBeUndefined();
  });

  it("keeps, replaces or removes the receipt photo as asked", async () => {
    const app = await freshApp();
    const patch = (payload: Record<string, unknown>) => app.inject({ method: "PATCH", url: "/v1/expenses/expense-2", headers: { ...ME, ...key() }, payload });
    const photo = async () => (await app.inject({ method: "GET", url: "/v1/expenses/expense-2", headers: ME })).json().receiptPath;
    await patch(expenseBody({ receiptUri: "demo-user/receipt-1.jpg" }));
    expect(await photo()).toBe("demo-user/receipt-1.jpg");
    await patch(expenseBody({ eventName: "Renamed" }));
    expect(await photo()).toBe("demo-user/receipt-1.jpg");
    expect((await patch(expenseBody({ receiptUri: null }))).statusCode).toBe(200);
    expect(await photo()).toBeUndefined();
  });
});

describe("deleting an expense", () => {
  it("removes it for good, drops it from balances and the list, and says so in the activity", async () => {
    const app = await freshApp();
    const before = (await app.inject({ method: "GET", url: "/v1/me/plan", headers: ME })).json();
    const response = await app.inject({ method: "DELETE", url: "/v1/expenses/expense-1", headers: ME });
    expect(response.statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/v1/expenses/expense-1", headers: ME })).statusCode).toBe(404);
    const after = (await app.inject({ method: "GET", url: "/v1/me/plan", headers: ME })).json();
    expect(after.transactions.some((item: { id: string }) => item.id === "expense-1")).toBe(false);
    expect(before.transactions.some((item: { id: string }) => item.id === "expense-1")).toBe(true);
    const event = after.activity.find((item: { detail: string }) => item.detail.includes("deleted this expense"));
    expect(event).toMatchObject({ title: "Dinner at Monal", tone: "warning", detail: "Huzaifa deleted this expense. It was 4800 PKR" });
    expect((await app.inject({ method: "DELETE", url: "/v1/expenses/expense-1", headers: ME })).statusCode).toBe(404);
  });

  it("is refused for a member who neither added nor paid it", async () => {
    const app = await freshApp();
    const response = await app.inject({ method: "DELETE", url: "/v1/expenses/expense-2", headers: HAMZA });
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toContain("group owner or admin");
    expect((await app.inject({ method: "GET", url: "/v1/expenses/expense-2", headers: ME })).statusCode).toBe(200);
  });
});

describe("editing and deleting an individual balance", () => {
  const settle = (app: FastifyInstance, id: string, amountMinor?: number) =>
    app.inject({ method: "POST", url: `/v1/personal-transactions/${id}/settle`, headers: { ...ME, ...key() }, payload: amountMinor === undefined ? {} : { amountMinor } });
  const patch = (app: FastifyInstance, id: string, payload: Record<string, unknown>, headers: Record<string, string> = ME) =>
    app.inject({ method: "PATCH", url: `/v1/personal-transactions/${id}`, headers, payload });
  const row = async (app: FastifyInstance, id: string) => (await app.inject({ method: "GET", url: "/v1/me/plan", headers: ME })).json().transactions.find((item: { id: string }) => item.id === id);

  it("changes everything on an entry nothing has been paid on", async () => {
    const app = await freshApp();
    const response = await patch(app, "personal-1", entryBody({ direction: "incoming", kind: "loan", note: "  new  ", currency: "usd" }));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: "personal-1" });
    expect(await row(app, "personal-1")).toMatchObject({ title: "Coffee and snacks", amountMinor: 200000, direction: "incoming", kind: "loan", currency: "USD", note: "new", counterparty: "Ali", personId: ALI, canEdit: true, canDelete: true });
  });

  it("locks direction and currency once something is paid, and keeps the amount above what was paid", async () => {
    const app = await freshApp();
    expect((await settle(app, "personal-1", 50000)).statusCode).toBe(204);
    expect((await patch(app, "personal-1", entryBody({ direction: "incoming" }))).json()).toMatchObject({ statusCode: 409, code: "entry_has_payments" });
    expect((await patch(app, "personal-1", entryBody({ currency: "USD" }))).json()).toMatchObject({ code: "entry_has_payments" });
    expect((await patch(app, "personal-1", entryBody({ amountMinor: 50000 }))).json()).toMatchObject({ statusCode: 409, code: "amount_below_paid" });
    expect((await patch(app, "personal-1", entryBody({ amountMinor: 49999 }))).json()).toMatchObject({ code: "amount_below_paid" });
    expect((await patch(app, "personal-1", entryBody({ amountMinor: 300000, title: "Bigger" }))).statusCode).toBe(200);
    expect(await row(app, "personal-1")).toMatchObject({ amountMinor: 300000, settledAmountMinor: 50000, status: "open", title: "Bigger" });
  });

  it("keeps the amount of a fully paid entry but lets its words change", async () => {
    const app = await freshApp();
    expect((await settle(app, "personal-1")).statusCode).toBe(204);
    expect((await patch(app, "personal-1", entryBody({ amountMinor: 999 }))).json()).toMatchObject({ statusCode: 409, code: "entry_settled" });
    expect((await patch(app, "personal-1", entryBody({ amountMinor: 185000, title: "Renamed after paying" }))).statusCode).toBe(200);
    expect(await row(app, "personal-1")).toMatchObject({ title: "Renamed after paying", status: "settled", settledAmountMinor: 185000 });
  });

  it("refuses someone else's entry as 'not found', a person that is not yours and a bad amount", async () => {
    const app = await freshApp();
    expect((await patch(app, "personal-1", entryBody(), HAMZA)).statusCode).toBe(404);
    expect((await patch(app, "personal-1", entryBody({ personId: "00000000-0000-4000-8000-000000000000" }))).json()).toMatchObject({ code: "person_not_found" });
    expect((await patch(app, "personal-1", entryBody({ amountMinor: 0 }))).statusCode).toBe(400);
    expect((await patch(app, "nope", entryBody())).statusCode).toBe(404);
    expect(await row(app, "personal-1")).toMatchObject({ title: "Coffee money", amountMinor: 185000 });
  });

  it("creates a saved person for a new name", async () => {
    const app = await freshApp();
    expect((await patch(app, "personal-1", entryBody({ personId: undefined, counterparty: "Brand New" }))).statusCode).toBe(200);
    const plan = (await app.inject({ method: "GET", url: "/v1/me/plan", headers: ME })).json();
    expect(plan.people.some((person: { name: string }) => person.name === "Brand New")).toBe(true);
  });

  it("deletes an entry, with its payments, once; and not someone else's", async () => {
    const app = await freshApp();
    await settle(app, "personal-2", 100000);
    expect((await app.inject({ method: "DELETE", url: "/v1/personal-transactions/personal-2", headers: HAMZA })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: "/v1/personal-transactions/personal-2", headers: ME })).statusCode).toBe(204);
    expect(await row(app, "personal-2")).toBeUndefined();
    expect((await app.inject({ method: "DELETE", url: "/v1/personal-transactions/personal-2", headers: ME })).statusCode).toBe(404);
  });
});

describe("what the plan says about editing", () => {
  it("individual balances can always be changed; payments never can", async () => {
    const app = await freshApp();
    expect((await app.inject({ method: "POST", url: "/v1/settlements/review-1/confirm", headers: { ...ME, ...key() }, payload: {} })).statusCode).toBe(204);
    const plan = (await app.inject({ method: "GET", url: "/v1/me/plan", headers: ME })).json();
    const personal = plan.transactions.filter((item: { source: string }) => item.source === "personal");
    expect(personal.length).toBeGreaterThan(0);
    expect(personal.every((item: { canEdit: boolean; canDelete: boolean }) => item.canEdit && item.canDelete)).toBe(true);
    const payments = plan.transactions.filter((item: { kind: string }) => item.kind === "payment");
    expect(payments.length).toBeGreaterThan(0);
    expect(payments.every((item: { canEdit: boolean; canDelete: boolean }) => item.canEdit === false && item.canDelete === false)).toBe(true);
  });

  it("group expenses say who may edit and who may only delete", async () => {
    const app = await freshApp();
    const hamzaPlan = (await app.inject({ method: "GET", url: "/v1/me/plan", headers: HAMZA })).json();
    const shared = hamzaPlan.transactions.find((item: { id: string }) => item.id === "expense-2");
    expect(shared).toMatchObject({ canEdit: false, canDelete: false });
    const myPlan = (await app.inject({ method: "GET", url: "/v1/me/plan", headers: ME })).json();
    expect(myPlan.transactions.find((item: { id: string }) => item.id === "expense-2")).toMatchObject({ canEdit: true, canDelete: true });
    expect(myPlan.transactions.find((item: { id: string }) => item.id === "expense-1")).toMatchObject({ canEdit: false, canDelete: true });
  });
});

import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";

// The memory repository seeds one person, Ali, linked to demo-user's two individual balances.
const ALI = "5d1c9a7e-3b2f-4e8a-9c6d-2f7b8e4a1c03";
const UNKNOWN_PERSON = "0f0e0d0c-0b0a-4908-8706-050403020100";

type PlanPerson = { id: string; name: string; email?: string; avatarUrl?: string; avatarPath?: string; createdAt: string };
type PlanTransaction = { id: string; source: string; counterparty?: string; personId?: string };
type PlanBody = { people: PlanPerson[]; transactions: PlanTransaction[] };

const openApps: FastifyInstance[] = [];
let keyCounter = 0;

async function createApp() {
  const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo" } });
  openApps.push(app);
  return app;
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

const as = (user: string) => ({ "x-user-id": user });

async function getPlan(app: FastifyInstance, user = "demo-user") {
  const response = await app.inject({ method: "GET", url: "/v1/me/plan", headers: as(user) });
  expect(response.statusCode).toBe(200);
  return response.json<PlanBody>();
}

async function addEntry(app: FastifyInstance, fields: { counterparty: string; personId?: string }, user = "demo-user") {
  return app.inject({
    method: "POST",
    url: "/v1/personal-transactions",
    headers: { ...as(user), "idempotency-key": `people-entry-${++keyCounter}` },
    payload: { title: "Lunch", eventDate: "2026-09-18", amountMinor: 250000, currency: "PKR", kind: "expense", direction: "outgoing", ...fields },
  });
}

const transaction = (plan: PlanBody, id: string) => plan.transactions.find((item) => item.id === id);

describe("People", () => {
  it("always includes people in the plan and links the seeded individual balances", async () => {
    const app = await createApp();
    const plan = await getPlan(app);
    expect(plan.people).toEqual([{ id: ALI, name: "Ali", email: "ali@example.com", createdAt: expect.any(String) }]);
    expect(transaction(plan, "personal-1")).toMatchObject({ counterparty: "Ali", personId: ALI });
    expect(transaction(plan, "personal-2")).toMatchObject({ counterparty: "Ali", personId: ALI });
    expect(plan.transactions.filter((item) => item.source === "group").every((item) => item.personId === undefined)).toBe(true);
    expect((await getPlan(app, "sara")).people).toEqual([]);
  });

  it("creates a person with a trimmed name and a normalized email, without an idempotency key", async () => {
    const app = await createApp();
    const created = await app.inject({ method: "POST", url: "/v1/people", headers: as("demo-user"), payload: { name: "  Zara Khan ", email: " Zara@Example.COM " } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), name: "Zara Khan", email: "zara@example.com", createdAt: expect.any(String) });

    const lower = await app.inject({ method: "POST", url: "/v1/people", headers: as("demo-user"), payload: { name: "bilal", email: "" } });
    expect(lower.statusCode).toBe(201);
    expect(lower.json()).not.toHaveProperty("email");

    const nulls = await app.inject({ method: "POST", url: "/v1/people", headers: as("demo-user"), payload: { name: "Quiet", email: null, avatarPath: null } });
    expect(nulls.statusCode).toBe(201);
    expect(nulls.json()).toEqual({ id: expect.any(String), name: "Quiet", createdAt: expect.any(String) });

    expect((await getPlan(app)).people.map((person) => person.name)).toEqual(["Ali", "bilal", "Quiet", "Zara Khan"]);
  });

  it("refuses a second person with the same name in another case, per owner", async () => {
    const app = await createApp();
    for (const name of ["ALI", " ali "]) {
      const duplicate = await app.inject({ method: "POST", url: "/v1/people", headers: as("demo-user"), payload: { name } });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toMatchObject({ code: "person_exists" });
    }
    const otherOwner = await app.inject({ method: "POST", url: "/v1/people", headers: as("hamza"), payload: { name: "Ali" } });
    expect(otherOwner.statusCode).toBe(201);
    expect((await getPlan(app)).people).toHaveLength(1);
  });

  it("validates names, emails, and photo paths", async () => {
    const app = await createApp();
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ name: "   " }, "invalid_person_name"],
      [{ name: "N".repeat(81) }, "validation_error"],
      [{ name: "Nadia", email: "not-an-email" }, "invalid_email"],
      [{ name: "Nadia", avatarPath: "sara/photo.jpg" }, "invalid_avatar_path"],
      [{ name: "Nadia", avatarPath: "demo-user/../sara/photo.jpg" }, "invalid_avatar_path"],
    ];
    for (const [payload, code] of cases) {
      const response = await app.inject({ method: "POST", url: "/v1/people", headers: as("demo-user"), payload });
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
      expect(response.json()).toMatchObject({ code });
    }
    const withPhoto = await app.inject({ method: "POST", url: "/v1/people", headers: as("demo-user"), payload: { name: "Nadia", avatarPath: "demo-user/nadia.jpg" } });
    expect(withPhoto.statusCode).toBe(201);
    expect(withPhoto.json()).toMatchObject({ name: "Nadia", avatarPath: "demo-user/nadia.jpg", avatarUrl: "demo-user/nadia.jpg" });
  });

  it("renames a person and their history shows the new name", async () => {
    const app = await createApp();
    const renamed = await app.inject({ method: "PATCH", url: `/v1/people/${ALI}`, headers: as("demo-user"), payload: { name: " Ali Raza " } });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ id: ALI, name: "Ali Raza", email: "ali@example.com" });
    const plan = await getPlan(app);
    expect(transaction(plan, "personal-1")).toMatchObject({ counterparty: "Ali Raza", personId: ALI });
    expect(transaction(plan, "personal-2")).toMatchObject({ counterparty: "Ali Raza", personId: ALI });

    const caseOnly = await app.inject({ method: "PATCH", url: `/v1/people/${ALI}`, headers: as("demo-user"), payload: { name: "ali raza" } });
    expect(caseOnly.statusCode).toBe(200);
    expect(transaction(await getPlan(app), "personal-1")).toMatchObject({ counterparty: "ali raza" });

    const zara = (await app.inject({ method: "POST", url: "/v1/people", headers: as("demo-user"), payload: { name: "Zara" } })).json<PlanPerson>();
    const clash = await app.inject({ method: "PATCH", url: `/v1/people/${zara.id}`, headers: as("demo-user"), payload: { name: "ALI RAZA" } });
    expect(clash.statusCode).toBe(409);
    expect(clash.json()).toMatchObject({ code: "person_exists" });
  });

  it("clears the email or photo with null and leaves omitted fields alone", async () => {
    const app = await createApp();
    const url = `/v1/people/${ALI}`;
    const withPhoto = await app.inject({ method: "PATCH", url, headers: as("demo-user"), payload: { avatarPath: "demo-user/ali.jpg" } });
    expect(withPhoto.json()).toEqual({ id: ALI, name: "Ali", email: "ali@example.com", avatarPath: "demo-user/ali.jpg", avatarUrl: "demo-user/ali.jpg", createdAt: expect.any(String) });

    const noEmail = await app.inject({ method: "PATCH", url, headers: as("demo-user"), payload: { email: null } });
    expect(noEmail.statusCode).toBe(200);
    expect(noEmail.json()).toEqual({ id: ALI, name: "Ali", avatarPath: "demo-user/ali.jpg", avatarUrl: "demo-user/ali.jpg", createdAt: expect.any(String) });

    const newEmail = await app.inject({ method: "PATCH", url, headers: as("demo-user"), payload: { email: " NEW@Example.com " } });
    expect(newEmail.json()).toMatchObject({ email: "new@example.com", avatarPath: "demo-user/ali.jpg" });

    const noPhoto = await app.inject({ method: "PATCH", url, headers: as("demo-user"), payload: { avatarPath: null } });
    expect(noPhoto.json()).toEqual({ id: ALI, name: "Ali", email: "new@example.com", createdAt: expect.any(String) });
    expect((await getPlan(app)).people).toEqual([noPhoto.json()]);

    const foreignPhoto = await app.inject({ method: "PATCH", url, headers: as("demo-user"), payload: { name: "Ali K", avatarPath: "hamza/x.jpg" } });
    expect(foreignPhoto.statusCode).toBe(400);
    expect((await getPlan(app)).people[0]).toMatchObject({ name: "Ali" });
  });

  it("deletes a person but keeps their entries under the same name", async () => {
    const app = await createApp();
    const deleted = await app.inject({ method: "DELETE", url: `/v1/people/${ALI}`, headers: as("demo-user") });
    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe("");
    const plan = await getPlan(app);
    expect(plan.people).toEqual([]);
    for (const id of ["personal-1", "personal-2"]) {
      expect(transaction(plan, id)).toMatchObject({ counterparty: "Ali" });
      expect(transaction(plan, id)).not.toHaveProperty("personId");
    }
    const again = await app.inject({ method: "DELETE", url: `/v1/people/${ALI}`, headers: as("demo-user") });
    expect(again.statusCode).toBe(404);
    expect(again.json()).toMatchObject({ code: "person_not_found" });
  });

  it("links earlier entries with the same name when that person is added again", async () => {
    const app = await createApp();
    await app.inject({ method: "DELETE", url: `/v1/people/${ALI}`, headers: as("demo-user") });
    const readded = await app.inject({ method: "POST", url: "/v1/people", headers: as("demo-user"), payload: { name: "ali" } });
    expect(readded.statusCode).toBe(201);
    const plan = await getPlan(app);
    expect(transaction(plan, "personal-1")).toMatchObject({ personId: readded.json().id, counterparty: "ali" });
    expect(transaction(plan, "personal-2")).toMatchObject({ personId: readded.json().id, counterparty: "ali" });
  });

  it("records an entry with a chosen person under their current name", async () => {
    const app = await createApp();
    const created = await addEntry(app, { counterparty: "Whoever the client typed", personId: ALI });
    expect(created.statusCode).toBe(201);
    const plan = await getPlan(app);
    expect(transaction(plan, created.json().id)).toMatchObject({ source: "personal", counterparty: "Ali", personId: ALI });
    expect(plan.people).toHaveLength(1);
  });

  it("adds a new name as a person and reuses them for the same name in any case", async () => {
    const app = await createApp();
    const first = await addEntry(app, { counterparty: "  Zara " });
    expect(first.statusCode).toBe(201);
    const afterFirst = await getPlan(app);
    const zara = afterFirst.people.find((person) => person.name === "Zara");
    expect(zara).toBeDefined();
    expect(transaction(afterFirst, first.json().id)).toMatchObject({ counterparty: "Zara", personId: zara?.id });

    const second = await addEntry(app, { counterparty: "ZARA" });
    expect(second.statusCode).toBe(201);
    const afterSecond = await getPlan(app);
    expect(afterSecond.people.filter((person) => person.name.toLowerCase() === "zara")).toHaveLength(1);
    expect(transaction(afterSecond, second.json().id)).toMatchObject({ counterparty: "Zara", personId: zara?.id });

    const existing = await addEntry(app, { counterparty: "ali" });
    expect(transaction(await getPlan(app), existing.json().id)).toMatchObject({ counterparty: "Ali", personId: ALI });
  });

  it("keeps people private to their owner", async () => {
    const app = await createApp();
    const foreignPatch = await app.inject({ method: "PATCH", url: `/v1/people/${ALI}`, headers: as("hamza"), payload: { name: "Mine now" } });
    expect(foreignPatch.statusCode).toBe(404);
    expect(foreignPatch.json()).toMatchObject({ code: "person_not_found" });
    const foreignDelete = await app.inject({ method: "DELETE", url: `/v1/people/${ALI}`, headers: as("hamza") });
    expect(foreignDelete.statusCode).toBe(404);
    const foreignEntry = await addEntry(app, { counterparty: "Ali", personId: ALI }, "hamza");
    expect(foreignEntry.statusCode).toBe(404);
    expect(foreignEntry.json()).toMatchObject({ code: "person_not_found" });

    for (const id of [UNKNOWN_PERSON, "not-a-uuid"]) {
      const unknown = await app.inject({ method: "PATCH", url: `/v1/people/${id}`, headers: as("demo-user"), payload: { name: "Nobody" } });
      expect(unknown.statusCode).toBe(404);
      expect(unknown.json()).toMatchObject({ code: "person_not_found" });
    }
    expect((await addEntry(app, { counterparty: "Ali", personId: UNKNOWN_PERSON })).statusCode).toBe(404);
    const malformed = await addEntry(app, { counterparty: "Ali", personId: "ali" });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({ code: "validation_error" });

    expect((await getPlan(app)).people).toEqual([expect.objectContaining({ id: ALI, name: "Ali" })]);
    expect((await getPlan(app, "hamza")).people).toEqual([]);
  });
});

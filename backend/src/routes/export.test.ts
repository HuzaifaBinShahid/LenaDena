import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

// Demo mode: demo-user has two individual balances with Ali and is in two groups; hamza and sara have no private entries.
const ME = { "x-user-id": "demo-user" };
const HAMZA = { "x-user-id": "hamza" };
const openApps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});
async function freshApp(config: Record<string, unknown> = {}) {
  const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo", ...config } });
  openApps.push(app);
  return app;
}
const get = (app: FastifyInstance, url: string, headers: Record<string, string> = ME) => app.inject({ method: "GET", url, headers });

describe("GET /v1/me/export", () => {
  it("downloads the person's records as a JSON file", async () => {
    const app = await freshApp();
    const response = await get(app, "/v1/me/export");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(response.headers["content-disposition"]).toMatch(/^attachment; filename="lenadena-export-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(response.headers["cache-control"]).toBe("no-store");
    // A file, not a JSON-quoted string.
    expect(response.body.startsWith("{")).toBe(true);
    const document = JSON.parse(response.body);
    expect(document).toMatchObject({ format: "lenadena-export", version: 1, account: { name: "Huzaifa", email: "huzaifa@example.com" } });
    expect(document.groups.map((group: { name: string }) => group.name).sort()).toEqual(["Flat bills", "Weekend crew"]);
    expect(document.individualBalances.map((entry: { title: string }) => entry.title).sort()).toEqual(["Camera loan", "Coffee money"]);
    expect(document.expenses.map((expense: { title: string }) => expense.title).sort()).toEqual(["Dinner at Monal", "September internet"]);
    expect(document.people).toEqual([expect.objectContaining({ name: "Ali", email: "ali@example.com" })]);
  });

  it("is JSON by default and says the format when asked", async () => {
    const app = await freshApp();
    expect((await get(app, "/v1/me/export?format=json")).headers["content-type"]).toContain("application/json");
    expect((await get(app, "/v1/me/export")).headers["content-type"]).toContain("application/json");
  });

  it("downloads a spreadsheet when asked, with a byte-order mark so Excel reads any script", async () => {
    const app = await freshApp();
    const response = await get(app, "/v1/me/export?format=csv");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(response.headers["content-disposition"]).toMatch(/filename="lenadena-export-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(response.body.startsWith("﻿Type,Date,Title,")).toBe(true);
    expect(response.body).toContain("Individual balance");
    expect(response.body).toContain("Coffee money");
    expect(response.body).toContain("Group expense");
    expect(response.body).toContain("September internet");
    expect(response.body).toContain("1850.00");
  });

  it("refuses an unknown format", async () => {
    const response = await get(await freshApp(), "/v1/me/export?format=xml");
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("validation_error");
  });

  it("gives each person only their own records, and never another member's email", async () => {
    const app = await freshApp();
    const mine = (await get(app, "/v1/me/export")).body;
    const theirs = (await get(app, "/v1/me/export", HAMZA)).body;
    expect(theirs).not.toContain("Coffee money");
    expect(theirs).not.toContain("Camera loan");
    expect(theirs).not.toContain("ali@example.com");
    expect(JSON.parse(theirs).individualBalances).toEqual([]);
    // Group members appear by name only.
    for (const email of ["sara@example.com", "hamza@example.com"]) expect(mine).not.toContain(email);
    expect(mine).toContain('"Hamza"');
  });

  it("reflects changes made after the first export", async () => {
    const app = await freshApp();
    expect((await get(app, "/v1/me/export")).body).toContain("Coffee money");
    await app.inject({ method: "DELETE", url: "/v1/personal-transactions/personal-1", headers: ME });
    expect((await get(app, "/v1/me/export")).body).not.toContain("Coffee money");
  });

  it("needs a signed-in person", async () => {
    const app = await freshApp({ authMode: "supabase", supabaseUrl: "https://example.supabase.co", supabaseSecretKey: "service-role-key" });
    const response = await app.inject({ method: "GET", url: "/v1/me/export" });
    expect(response.statusCode).toBe(401);
  });

  it("is rate limited, because it reads a lot", async () => {
    const app = await freshApp();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) statuses.push((await get(app, "/v1/me/export")).statusCode);
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses.slice(5)).toEqual([429, 429]);
  });
});

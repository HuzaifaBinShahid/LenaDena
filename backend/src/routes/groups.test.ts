import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";

// Demo mode: demo-user (huzaifa@) is first in, so owns, both seeded groups. sara (sara@) is in Weekend crew only;
// hamza (hamza@) is in both. In Flat bills hamza owes demo-user Rs 1,100 and has a payment awaiting review.
const ME = { "x-user-id": "demo-user" };
const HAMZA = { "x-user-id": "hamza" };
const SARA = { "x-user-id": "sara" };
const STRANGER = { "x-user-id": "nobody-in-any-group" };

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
const key = () => ({ "idempotency-key": `group-test-key-${String(++counter).padStart(4, "0")}` });
const call = (app: FastifyInstance, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, headers: Record<string, string> = ME, payload?: Record<string, unknown>) =>
  app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
const invite = (app: FastifyInstance, groupId: string, email: string, headers = ME) => call(app, "POST", `/v1/groups/${groupId}/invitations`, headers, { email });
const plan = async (app: FastifyInstance, headers = ME) => (await call(app, "GET", "/v1/me/plan", headers)).json();

async function newGroup(app: FastifyInstance, name = "Trip") {
  const created = await app.inject({ method: "POST", url: "/v1/groups", headers: { ...ME, ...key() }, payload: { name, currency: "PKR", accent: "#6848E6", inviteEmails: [] } });
  expect(created.statusCode).toBe(201);
  return created.json().id as string;
}

describe("inviting by email", () => {
  it("sends the invitation, and the person with an account sees it inside the app", async () => {
    const app = await freshApp();
    const response = await invite(app, "flat-bills", "sara@example.com");
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ url: expect.stringMatching(/^lenadena:\/\/invite\//), expiresAt: expect.any(String) });
    const mine = (await call(app, "GET", "/v1/me/invitations", SARA)).json();
    expect(mine).toEqual([expect.objectContaining({ groupId: "flat-bills", groupName: "Flat bills", invitedBy: "Huzaifa" })]);
    expect(JSON.stringify(mine)).not.toContain("lenadena://");
    expect((await call(app, "GET", "/v1/me/invitations", HAMZA)).json()).toEqual([]);
  });

  it("answers the same for an address with no account, so nothing shows who has one", async () => {
    const app = await freshApp();
    const known = await invite(app, "flat-bills", "sara@example.com");
    const unknown = await invite(app, "flat-bills", "stranger-with-no-account@example.com");
    expect(unknown.statusCode).toBe(known.statusCode);
    expect(Object.keys(unknown.json()).sort()).toEqual(Object.keys(known.json()).sort());
  });

  it("refuses an existing member, a bad address and a repeat within 12 hours", async () => {
    const app = await freshApp();
    expect((await invite(app, "flat-bills", " HAMZA@example.com ")).json()).toMatchObject({ statusCode: 409, code: "conflict" });
    expect((await invite(app, "flat-bills", "not an email")).json()).toMatchObject({ statusCode: 400, code: "invalid_email" });
    expect((await invite(app, "flat-bills", "new@example.com")).statusCode).toBe(201);
    expect((await invite(app, "flat-bills", "NEW@example.com")).json()).toMatchObject({ statusCode: 409, code: "already_invited" });
  });

  it("is for members only, and an unknown group is 'not found'", async () => {
    const app = await freshApp();
    expect((await invite(app, "weekend-crew", "x@example.com", STRANGER)).statusCode).toBe(404);
    expect((await invite(app, "no-such-group", "x@example.com")).statusCode).toBe(404);
  });

  it("is rate limited per hour, before the database's own daily cap", async () => {
    const app = await freshApp();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 22; attempt += 1) statuses.push((await invite(app, "flat-bills", `bulk${attempt}@example.com`)).statusCode);
    expect(statuses.slice(0, 20).every((status) => status === 201)).toBe(true);
    expect(statuses.slice(20)).toEqual([429, 429]);
  });
});

describe("accepting and declining in the app", () => {
  it("joins the group when accepted: the group is in their plan and the invitation is gone", async () => {
    const app = await freshApp();
    await invite(app, "flat-bills", "sara@example.com");
    const [invitation] = (await call(app, "GET", "/v1/me/invitations", SARA)).json();
    const accepted = await call(app, "POST", `/v1/me/invitations/${invitation.id}/accept`, SARA);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ id: "flat-bills", name: "Flat bills" });
    expect((await plan(app, SARA)).groups.map((group: { id: string }) => group.id)).toContain("flat-bills");
    expect((await call(app, "GET", "/v1/me/invitations", SARA)).json()).toEqual([]);
    expect((await call(app, "POST", `/v1/me/invitations/${invitation.id}/accept`, SARA)).statusCode).toBe(404);
  });

  it("is only for the person it was sent to", async () => {
    const app = await freshApp();
    await invite(app, "flat-bills", "sara@example.com");
    const [invitation] = (await call(app, "GET", "/v1/me/invitations", SARA)).json();
    expect((await call(app, "POST", `/v1/me/invitations/${invitation.id}/accept`, HAMZA)).statusCode).toBe(404);
    expect((await call(app, "POST", `/v1/me/invitations/${invitation.id}/decline`, HAMZA)).statusCode).toBe(404);
    expect((await call(app, "POST", "/v1/me/invitations/not-a-real-id/accept", SARA)).statusCode).toBe(404);
  });

  it("can be declined, and then cannot be accepted", async () => {
    const app = await freshApp();
    await invite(app, "flat-bills", "sara@example.com");
    const [invitation] = (await call(app, "GET", "/v1/me/invitations", SARA)).json();
    expect((await call(app, "POST", `/v1/me/invitations/${invitation.id}/decline`, SARA)).statusCode).toBe(204);
    expect((await call(app, "GET", "/v1/me/invitations", SARA)).json()).toEqual([]);
    expect((await call(app, "POST", `/v1/me/invitations/${invitation.id}/accept`, SARA)).statusCode).toBe(404);
    expect((await plan(app, SARA)).groups.map((group: { id: string }) => group.id)).not.toContain("flat-bills");
  });
});

describe("the member list", () => {
  it("shows roles, who is settled and the open invitations, and who may manage", async () => {
    const app = await freshApp();
    await invite(app, "flat-bills", "pending@example.com");
    const owner = (await call(app, "GET", "/v1/groups/flat-bills/members")).json();
    expect(owner.canManage).toBe(true);
    expect(owner.members.map((member: { name: string; role: string }) => [member.name, member.role])).toEqual([["Huzaifa", "owner"], ["Hamza", "member"]]);
    expect(owner.members.every((member: Record<string, unknown>) => !("email" in member) && !("balanceMinor" in member))).toBe(true);
    // Hamza owes Rs 1,100 and has a payment waiting for review, so he is not settled.
    expect(owner.members.find((member: { name: string }) => member.name === "Hamza").settled).toBe(false);
    expect(owner.invitations).toEqual([expect.objectContaining({ email: "pending@example.com", invitedBy: "Huzaifa" })]);
    // What each owes the caller: Hamza owes Huzaifa Rs 1,100 here; from Hamza's side it is the other way round.
    expect(owner.members.map((member: { name: string; owesYouMinor: number }) => [member.name, member.owesYouMinor])).toEqual([["Huzaifa", 0], ["Hamza", 110000]]);
    expect((await call(app, "GET", "/v1/groups/flat-bills/members", HAMZA)).json().members.map((member: { name: string; owesYouMinor: number }) => [member.name, member.owesYouMinor])).toEqual([["Huzaifa", -110000], ["Hamza", 0]]);
    expect((await call(app, "GET", "/v1/groups/flat-bills/members", HAMZA)).json().canManage).toBe(false);
    expect((await call(app, "GET", "/v1/groups/flat-bills/members", STRANGER)).statusCode).toBe(404);
  });
});

describe("leaving and removing", () => {
  it("blocks leaving while money is owed or a payment is waiting, and allows it once settled", async () => {
    const app = await freshApp();
    const refused = await call(app, "POST", "/v1/groups/flat-bills/leave", HAMZA);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: "not_settled", message: expect.stringContaining("Settle up first") });
    expect((await call(app, "POST", "/v1/settlements/review-1/confirm", { ...ME, ...key() }, {})).statusCode).toBe(204);
    // The confirmed payment clears what Hamza owed.
    expect((await call(app, "POST", "/v1/groups/flat-bills/leave", HAMZA)).statusCode).toBe(204);
    expect((await plan(app, HAMZA)).groups.map((group: { id: string }) => group.id)).not.toContain("flat-bills");
    expect((await call(app, "GET", "/v1/groups/flat-bills/members")).json().members.map((member: { name: string }) => member.name)).toEqual(["Huzaifa"]);
    expect((await call(app, "POST", "/v1/groups/flat-bills/leave", HAMZA)).statusCode).toBe(404);
  });

  it("keeps the owner in while others remain", async () => {
    const app = await freshApp();
    expect((await call(app, "POST", "/v1/groups/weekend-crew/leave")).json()).toMatchObject({ statusCode: 409, code: "owner_cannot_leave" });
  });

  it("lets the owner remove a settled member and nobody else do it", async () => {
    const app = await freshApp();
    const trip = await newGroup(app);
    await invite(app, trip, "hamza@example.com");
    const [invitation] = (await call(app, "GET", "/v1/me/invitations", HAMZA)).json();
    await call(app, "POST", `/v1/me/invitations/${invitation.id}/accept`, HAMZA);
    expect((await call(app, "DELETE", `/v1/groups/${trip}/members/demo-user`, HAMZA)).statusCode).toBe(403);
    expect((await call(app, "DELETE", `/v1/groups/${trip}/members/demo-user`)).json()).toMatchObject({ statusCode: 400, code: "use_leave" });
    expect((await call(app, "DELETE", `/v1/groups/${trip}/members/not-in-it`)).statusCode).toBe(404);
    expect((await call(app, "DELETE", `/v1/groups/${trip}/members/hamza`)).statusCode).toBe(204);
    expect((await plan(app, HAMZA)).groups.map((group: { id: string }) => group.id)).not.toContain(trip);
  });

  it("refuses to remove someone who is not settled", async () => {
    const app = await freshApp();
    expect((await call(app, "DELETE", "/v1/groups/flat-bills/members/hamza")).json()).toMatchObject({ statusCode: 409, code: "not_settled" });
  });
});

describe("renaming", () => {
  it("lets the owner rename, records it, and refuses others and bad names", async () => {
    const app = await freshApp();
    expect((await call(app, "PATCH", "/v1/groups/weekend-crew", ME, { name: "  Weekend Crew 2  " })).statusCode).toBe(204);
    const after = await plan(app);
    expect(after.groups.find((group: { id: string }) => group.id === "weekend-crew").name).toBe("Weekend Crew 2");
    expect(after.activity.some((item: { detail: string }) => item.detail === "Renamed from Weekend crew")).toBe(true);
    expect((await call(app, "PATCH", "/v1/groups/weekend-crew", HAMZA, { name: "Hijacked" })).statusCode).toBe(403);
    expect((await call(app, "PATCH", "/v1/groups/weekend-crew", ME, { name: "x" })).statusCode).toBe(400);
    expect((await call(app, "PATCH", "/v1/groups/weekend-crew", ME, { name: "a".repeat(81) })).statusCode).toBe(400);
    expect((await call(app, "PATCH", "/v1/groups/weekend-crew", STRANGER, { name: "Nope Nope" })).statusCode).toBe(404);
  });
});

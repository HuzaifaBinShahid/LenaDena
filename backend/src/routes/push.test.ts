import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import type { PushMessage, PushResult, PushSender } from "../push/fcm.js";

// Demo mode: demo-user (Huzaifa) owns Flat bills, where hamza owes Rs 1,100 (and has a payment awaiting review).
// sara is in Weekend crew only.
const ME = { "x-user-id": "demo-user" };
const HAMZA = { "x-user-id": "hamza" };
const SARA = { "x-user-id": "sara" };
const STRANGER = { "x-user-id": "nobody-in-any-group" };
const HAMZA_PHONE = "hamza-phone-token-aaaaaaaaaaaa";
const HAMZA_TABLET = "hamza-tablet-token-aaaaaaaaaa";
const SARA_PHONE = "sara-phone-token-aaaaaaaaaaaaa";

class FakeFirebase implements PushSender {
  readonly sent: Array<{ tokens: string[]; message: PushMessage }> = [];
  result: PushResult | ((tokens: string[]) => PushResult) = (tokens) => ({ delivered: tokens.length, invalidTokens: [], failed: 0 });
  throws = false;
  delayMs = 0;
  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    this.sent.push({ tokens, message });
    if (this.delayMs) await new Promise((resolve) => { setTimeout(resolve, this.delayMs); });
    if (this.throws) throw new Error("firebase exploded");
    return typeof this.result === "function" ? this.result(tokens) : this.result;
  }
}

const openApps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});
/** `null` means a server with no Firebase credentials. */
async function freshApp(sender: PushSender | null = new FakeFirebase()) {
  const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo" }, inviteFloorMs: 0, ...(sender ? { pushSender: sender } : {}) });
  openApps.push(app);
  return app;
}
const call = (app: FastifyInstance, method: "GET" | "POST", url: string, headers: Record<string, string> = ME, payload?: Record<string, unknown>) =>
  app.inject({ method, url, headers, ...(payload ? { payload } : {}) });
const register = (app: FastifyInstance, headers: Record<string, string>, token: string, platform = "android") => call(app, "POST", "/v1/me/push-token", headers, { token, platform });
const remind = (app: FastifyInstance, memberId = "hamza", groupId = "flat-bills", headers = ME) => call(app, "POST", `/v1/groups/${groupId}/nudges`, headers, { memberId });

describe("registering a phone", () => {
  it("stores the token for the person and answers 204", async () => {
    const app = await freshApp();
    const response = await register(app, HAMZA, HAMZA_PHONE);
    expect(response.statusCode).toBe(204);
    expect((await call(app, "GET", "/v1/me/export?format=json", HAMZA)).json().notificationDevices).toEqual([expect.objectContaining({ platform: "android" })]);
  });

  it("never puts the token in the export", async () => {
    const app = await freshApp();
    await register(app, HAMZA, HAMZA_PHONE);
    expect((await call(app, "GET", "/v1/me/export?format=json", HAMZA)).body).not.toContain(HAMZA_PHONE);
  });

  it("registers the same token twice without making a second device", async () => {
    const app = await freshApp();
    await register(app, HAMZA, HAMZA_PHONE);
    await register(app, HAMZA, HAMZA_PHONE);
    expect((await call(app, "GET", "/v1/me/export?format=json", HAMZA)).json().notificationDevices).toHaveLength(1);
  });

  it("moves a token to whoever signs in on that phone last", async () => {
    const app = await freshApp();
    await register(app, HAMZA, HAMZA_PHONE);
    await register(app, SARA, HAMZA_PHONE);
    expect((await call(app, "GET", "/v1/me/export?format=json", HAMZA)).json().notificationDevices).toEqual([]);
    expect((await call(app, "GET", "/v1/me/export?format=json", SARA)).json().notificationDevices).toHaveLength(1);
  });

  it("refuses a short token, an unknown platform and a missing field", async () => {
    const app = await freshApp();
    expect((await register(app, HAMZA, "short")).statusCode).toBe(400);
    expect((await register(app, HAMZA, HAMZA_PHONE, "windows")).statusCode).toBe(400);
    expect((await call(app, "POST", "/v1/me/push-token", HAMZA, { token: HAMZA_PHONE })).statusCode).toBe(400);
  });

  it("answers 503 push_unavailable when the server has no Firebase credentials", async () => {
    const app = await freshApp(null);
    expect((await register(app, HAMZA, HAMZA_PHONE)).json()).toMatchObject({ statusCode: 503, code: "push_unavailable" });
  });

});

describe("removing a phone", () => {
  it("removes only the caller's own token, and is harmless for an unknown one", async () => {
    const app = await freshApp();
    await register(app, HAMZA, HAMZA_PHONE);
    expect((await call(app, "POST", "/v1/me/push-token/remove", SARA, { token: HAMZA_PHONE })).statusCode).toBe(204);
    expect((await call(app, "GET", "/v1/me/export?format=json", HAMZA)).json().notificationDevices).toHaveLength(1);
    expect((await call(app, "POST", "/v1/me/push-token/remove", HAMZA, { token: HAMZA_PHONE })).statusCode).toBe(204);
    expect((await call(app, "GET", "/v1/me/export?format=json", HAMZA)).json().notificationDevices).toEqual([]);
    expect((await call(app, "POST", "/v1/me/push-token/remove", HAMZA, { token: "never-registered-token-aaaaaa" })).statusCode).toBe(204);
  });

  it("still works with no Firebase credentials, so signing out can always clean up", async () => {
    const app = await freshApp(null);
    expect((await call(app, "POST", "/v1/me/push-token/remove", HAMZA, { token: HAMZA_PHONE })).statusCode).toBe(204);
  });
});

describe("remind someone who owes you", () => {
  it("sends a push to every device of the person and says so", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    await register(app, HAMZA, HAMZA_PHONE);
    await register(app, HAMZA, HAMZA_TABLET, "ios");
    const response = await remind(app);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "sent" });
    expect(firebase.sent).toHaveLength(1);
    expect([...firebase.sent[0]!.tokens].sort()).toEqual([HAMZA_PHONE, HAMZA_TABLET].sort());
    expect(firebase.sent[0]!.message).toMatchObject({ title: "Huzaifa sent you a reminder", data: { type: "nudge", groupId: "flat-bills" }, channelId: "reminders" });
    expect(firebase.sent[0]!.message.body).toMatch(/Rs.1,100/);
    expect(firebase.sent[0]!.message.body).toContain("Flat bills");
  });

  it("never sends the person's reminder to anyone else's phone", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    await register(app, HAMZA, HAMZA_PHONE);
    await register(app, SARA, SARA_PHONE);
    await remind(app);
    expect(firebase.sent[0]!.tokens).toEqual([HAMZA_PHONE]);
  });

  it("says no_device, sends nothing and uses up nothing when the person has no phone registered", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    expect((await remind(app)).json()).toEqual({ status: "no_device" });
    expect(firebase.sent).toHaveLength(0);
    await register(app, HAMZA, HAMZA_PHONE);
    expect((await remind(app)).json()).toEqual({ status: "sent" });
  });

  it("allows only one reminder a day for the same person and group", async () => {
    const app = await freshApp();
    await register(app, HAMZA, HAMZA_PHONE);
    expect((await remind(app)).json()).toEqual({ status: "sent" });
    expect((await remind(app)).json()).toMatchObject({ statusCode: 429, code: "nudge_cooldown" });
  });

  it("takes the reminder back when nothing was delivered, so the day is not used up", async () => {
    const firebase = new FakeFirebase();
    firebase.result = { delivered: 0, invalidTokens: [], failed: 1 };
    const app = await freshApp(firebase);
    await register(app, HAMZA, HAMZA_PHONE);
    expect((await remind(app)).json()).toEqual({ status: "failed" });
    firebase.result = { delivered: 1, invalidTokens: [], failed: 0 };
    expect((await remind(app)).json()).toEqual({ status: "sent" });
  });

  it("treats a Firebase that throws like a failed delivery", async () => {
    const firebase = new FakeFirebase();
    firebase.throws = true;
    const app = await freshApp(firebase);
    await register(app, HAMZA, HAMZA_PHONE);
    expect((await remind(app)).json()).toEqual({ status: "failed" });
    firebase.throws = false;
    expect((await remind(app)).json()).toEqual({ status: "sent" });
  });

  it("deletes tokens Firebase says are dead, and reports no_device when that was all of them", async () => {
    const firebase = new FakeFirebase();
    firebase.result = (tokens) => ({ delivered: 0, invalidTokens: tokens, failed: 0 });
    const app = await freshApp(firebase);
    await register(app, HAMZA, HAMZA_PHONE);
    expect((await remind(app)).json()).toEqual({ status: "no_device" });
    expect((await call(app, "GET", "/v1/me/export?format=json", HAMZA)).json().notificationDevices).toEqual([]);
  });

  it("keeps the live device when only one of two is dead, and still says sent", async () => {
    const firebase = new FakeFirebase();
    firebase.result = (tokens) => ({ delivered: 1, invalidTokens: tokens.filter((token) => token === HAMZA_TABLET), failed: 0 });
    const app = await freshApp(firebase);
    await register(app, HAMZA, HAMZA_PHONE);
    await register(app, HAMZA, HAMZA_TABLET);
    expect((await remind(app)).json()).toEqual({ status: "sent" });
    expect((await call(app, "GET", "/v1/me/export?format=json", HAMZA)).json().notificationDevices).toHaveLength(1);
  });

  it("only reminds someone who really owes: not the other way round, not yourself, not an outsider", async () => {
    const app = await freshApp();
    await register(app, ME, "demo-user-phone-token-aaaaaaaa");
    expect((await remind(app, "demo-user", "flat-bills", HAMZA)).json()).toMatchObject({ statusCode: 409, code: "nothing_owed" });
    expect((await remind(app, "demo-user", "flat-bills", ME)).json()).toMatchObject({ statusCode: 400, code: "cannot_nudge_yourself" });
    expect((await remind(app, "hamza", "flat-bills", STRANGER)).json()).toMatchObject({ statusCode: 404 });
    expect((await remind(app, "hamza", "no-such-group")).json()).toMatchObject({ statusCode: 404 });
    expect((await remind(app, "not-in-the-group")).json()).toMatchObject({ statusCode: 404 });
  });

  it("tells the app to offer a shared message instead when the server has no Firebase credentials, without touching any data", async () => {
    const app = await freshApp(null);
    expect((await remind(app)).json()).toEqual({ status: "unavailable" });
  });

  it("refuses a request with no member", async () => {
    const app = await freshApp();
    expect((await call(app, "POST", "/v1/groups/flat-bills/nudges", ME, {})).statusCode).toBe(400);
  });
});

describe("the push for an invitation", () => {
  const invite = (app: FastifyInstance, email: string, headers = ME) => call(app, "POST", "/v1/groups/flat-bills/invitations", headers, { email });

  it("tells an account with a phone about it, and answers the inviter exactly as before", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    await register(app, SARA, SARA_PHONE);
    const known = await invite(app, "sara@example.com");
    expect(known.statusCode).toBe(201);
    expect(firebase.sent).toHaveLength(1);
    expect(firebase.sent[0]!.tokens).toEqual([SARA_PHONE]);
    expect(firebase.sent[0]!.message).toMatchObject({ title: "Huzaifa invited you to Flat bills", data: { type: "group_invite", groupId: "flat-bills" } });
    const unknown = await invite(app, "stranger-with-no-account@example.com");
    expect(unknown.statusCode).toBe(known.statusCode);
    expect(Object.keys(unknown.json()).sort()).toEqual(Object.keys(known.json()).sort());
    expect(firebase.sent).toHaveLength(1);
  });

  it("sends nothing to an account that has no phone registered, or to someone already in the group", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    await register(app, HAMZA, HAMZA_PHONE);
    expect((await invite(app, "sara@example.com")).statusCode).toBe(201);
    expect((await invite(app, "hamza@example.com")).statusCode).toBe(409);
    expect(firebase.sent).toHaveLength(0);
  });

  it("is not affected by a Firebase that throws", async () => {
    const firebase = new FakeFirebase();
    firebase.throws = true;
    const app = await freshApp(firebase);
    await register(app, SARA, SARA_PHONE);
    expect((await invite(app, "sara@example.com")).statusCode).toBe(201);
  });

  it("does not wait longer than a few seconds for a slow Firebase", async () => {
    const firebase = new FakeFirebase();
    firebase.delayMs = 3600;
    const app = await freshApp(firebase);
    await register(app, SARA, SARA_PHONE);
    const started = Date.now();
    expect((await invite(app, "sara@example.com")).statusCode).toBe(201);
    expect(Date.now() - started).toBeLessThan(3500);
  }, 10_000);

  it("takes at least the fixed minimum whether or not anyone was notified, so the time says nothing", async () => {
    const firebase = new FakeFirebase();
    const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo" }, pushSender: firebase, inviteFloorMs: 250 });
    openApps.push(app);
    await register(app, SARA, SARA_PHONE);
    for (const email of ["sara@example.com", "nobody-at-all@example.com"]) {
      const started = Date.now();
      expect((await invite(app, email)).statusCode).toBe(201);
      expect(Date.now() - started).toBeGreaterThanOrEqual(240);
    }
  });

  it("is as quick as ever when pushes are off", async () => {
    const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo" }, inviteFloorMs: 600 });
    openApps.push(app);
    const started = Date.now();
    expect((await invite(app, "sara@example.com")).statusCode).toBe(201);
    expect(Date.now() - started).toBeLessThan(400);
  });
});

describe("what a deleted account leaves behind", () => {
  it("removes the phones: nothing is pushed to them afterwards", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    await register(app, HAMZA, HAMZA_PHONE);
    expect((await call(app, "POST", "/v1/me/delete", HAMZA, { confirm: "DELETE" })).statusCode).toBe(204);
    expect((await remind(app)).json()).toEqual({ status: "no_device" });
    expect(firebase.sent).toHaveLength(0);
  });
});

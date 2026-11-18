import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { sendPaymentPush } from "../push/paymentPush.js";
import type { PushMessage, PushResult, PushSender } from "../push/fcm.js";
import { MemoryLedgerRepository } from "../repositories/MemoryLedgerRepository.js";

// Demo mode: demo-user (Huzaifa) owes sara Rs 2,400 in Weekend crew, and hamza has a payment of Rs 1,100 awaiting
// demo-user's review (review-1) in Flat bills. sara has never opened the app, so demo-user may settle at once.
const ME = { "x-user-id": "demo-user" };
const SARA = { "x-user-id": "sara" };
const HAMZA = { "x-user-id": "hamza" };
const ME_PHONE = "demo-phone-token-aaaaaaaaaaaaa";
const SARA_PHONE = "sara-phone-token-aaaaaaaaaaaaa";
const HAMZA_PHONE = "hamza-phone-token-aaaaaaaaaaaa";

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
  types() { return this.sent.map((item) => item.message.data.type); }
}

const openApps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(openApps.splice(0).map((app) => app.close())); });

async function freshApp(sender: PushSender | null = new FakeFirebase()) {
  const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo" }, inviteFloorMs: 0, ...(sender ? { pushSender: sender } : {}) });
  openApps.push(app);
  return app;
}
let counter = 0;
const key = () => `payment-key-${String(++counter).padStart(6, "0")}`;
const post = (app: FastifyInstance, url: string, headers: Record<string, string>, payload?: Record<string, unknown>, idempotencyKey = key()) =>
  app.inject({ method: "POST", url, headers: { ...headers, "idempotency-key": idempotencyKey }, payload: payload ?? {} });
const register = (app: FastifyInstance, headers: Record<string, string>, token: string) =>
  app.inject({ method: "POST", url: "/v1/me/push-token", headers, payload: { token, platform: "android" } });
const claimToSara = (app: FastifyInstance, amountMinor = 1000, idempotencyKey = key()) =>
  post(app, "/v1/settlements", ME, { groupId: "weekend-crew", recipientMemberId: "sara", amountMinor }, idempotencyKey);

describe("telling the other person about a payment", () => {
  it("notifies the recipient when the payer says they paid, and the answer is the same as before", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    await register(app, SARA, SARA_PHONE);
    const response = await claimToSara(app, 5000);
    expect(response.statusCode).toBe(201);
    expect(firebase.sent).toHaveLength(1);
    expect(firebase.sent[0]?.tokens).toEqual([SARA_PHONE]);
    expect(firebase.sent[0]?.message.title).toMatch(/says they paid you$/);
    expect(firebase.sent[0]?.message.body).toMatch(/Rs.50 in .*Tap to confirm it\.$/);
    expect(firebase.sent[0]?.message.data).toEqual({ type: "payment_claimed", groupId: "weekend-crew", settlementId: response.json().id });
  });

  it("does not notify twice when the same request is retried", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    await register(app, SARA, SARA_PHONE);
    const retryKey = key();
    const first = await claimToSara(app, 1000, retryKey);
    const second = await claimToSara(app, 1000, retryKey);
    expect(second.json().id).toBe(first.json().id);
    expect(firebase.sent).toHaveLength(1);
  });

  it("notifies the payer when the recipient confirms", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    await register(app, HAMZA, HAMZA_PHONE);
    const retryKey = key();
    expect((await post(app, "/v1/settlements/review-1/confirm", ME, {}, retryKey)).statusCode).toBe(204);
    expect(firebase.sent).toHaveLength(1);
    expect(firebase.sent[0]?.tokens).toEqual([HAMZA_PHONE]);
    expect(firebase.sent[0]?.message.title).toMatch(/confirmed your payment$/);
    expect(firebase.sent[0]?.message.data).toEqual({ type: "payment_confirmed", groupId: "flat-bills", settlementId: "review-1" });
    // The same request again changes nothing and sends nothing.
    expect((await post(app, "/v1/settlements/review-1/confirm", ME, {}, retryKey)).statusCode).toBe(204);
    expect(firebase.sent).toHaveLength(1);
  });

  it("notifies the payer when the recipient says it needs attention", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    await register(app, HAMZA, HAMZA_PHONE);
    expect((await post(app, "/v1/settlements/review-1/attention", ME, { note: "Not received" })).statusCode).toBe(204);
    expect(firebase.types()).toEqual(["payment_needs_attention"]);
    expect(firebase.sent[0]?.message.title).toMatch(/says your payment needs a look$/);
  });

  it("notifies the recipient when the payer settles it themselves", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    await register(app, SARA, SARA_PHONE);
    const claim = await claimToSara(app, 2000);
    expect((await post(app, `/v1/settlements/${claim.json().id}/self-confirm`, ME)).statusCode).toBe(204);
    expect(firebase.types()).toEqual(["payment_claimed", "payment_self_confirmed"]);
    expect(firebase.sent[1]?.tokens).toEqual([SARA_PHONE]);
  });

  it("sends nothing to a person with no phone registered, and the payment still works", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    expect((await claimToSara(app)).statusCode).toBe(201);
    expect((await post(app, "/v1/settlements/review-1/confirm", ME)).statusCode).toBe(204);
    expect(firebase.sent).toHaveLength(0);
  });

  it("sends nothing when someone's own request fails (wrong person, wrong state)", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    await register(app, HAMZA, HAMZA_PHONE);
    await register(app, ME, ME_PHONE);
    expect((await post(app, "/v1/settlements/review-1/confirm", HAMZA)).statusCode).toBe(403);
    expect((await post(app, "/v1/settlements/review-1/confirm", ME)).statusCode).toBe(204);
    expect((await post(app, "/v1/settlements/review-1/confirm", ME)).statusCode).toBe(409);
    expect(firebase.types()).toEqual(["payment_confirmed"]);
  });

  it("still answers normally on a server with no Firebase credentials", async () => {
    const app = await freshApp(null);
    expect((await claimToSara(app)).statusCode).toBe(201);
    expect((await post(app, "/v1/settlements/review-1/confirm", ME)).statusCode).toBe(204);
  });

  it("still answers normally when Firebase throws or cannot deliver", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    await register(app, SARA, SARA_PHONE);
    firebase.throws = true;
    expect((await claimToSara(app)).statusCode).toBe(201);
    firebase.throws = false;
    firebase.result = { delivered: 0, invalidTokens: [], failed: 1 };
    expect((await claimToSara(app)).statusCode).toBe(201);
    expect(firebase.sent).toHaveLength(2);
  });

  it("forgets a phone Firebase says no longer exists", async () => {
    const firebase = new FakeFirebase();
    firebase.result = { delivered: 0, invalidTokens: [SARA_PHONE], failed: 0 };
    const app = await freshApp(firebase);
    await register(app, SARA, SARA_PHONE);
    expect((await claimToSara(app)).statusCode).toBe(201);
    expect((await app.inject({ method: "GET", url: "/v1/me/export?format=json", headers: SARA })).json().notificationDevices).toEqual([]);
  });

  it("does not let one payer flood a person: only the first five claims in an hour notify", async () => {
    const firebase = new FakeFirebase();
    const app = await freshApp(firebase);
    await register(app, SARA, SARA_PHONE);
    for (let i = 0; i < 8; i += 1) expect((await claimToSara(app, 1000)).statusCode).toBe(201);
    expect(firebase.sent).toHaveLength(5);
  });
});

describe("sendPaymentPush", () => {
  const quietLog = () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) as never;

  it("gives up on a slow Firebase after the time it is given, instead of holding the payment request open", async () => {
    const repo = new MemoryLedgerRepository();
    await repo.registerPushToken("sara", SARA_PHONE, "android");
    const claim = await repo.createSettlement("demo-user", { groupId: "weekend-crew", recipientMemberId: "sara", amountMinor: 1000 }, key());
    const firebase = new FakeFirebase();
    firebase.delayMs = 400;
    const log = quietLog();
    const started = Date.now();
    await sendPaymentPush({ ledger: repo, sender: firebase, log, userId: "demo-user", settlementId: claim.id, event: "claimed", timeoutMs: 30 });
    expect(Date.now() - started).toBeLessThan(300);
    expect((log as unknown as { warn: ReturnType<typeof vi.fn> }).warn).toHaveBeenCalledWith({ event: "claimed" }, expect.stringContaining("did not answer in time"));
  });

  it("never throws, even when the database fails", async () => {
    const repo = new MemoryLedgerRepository();
    vi.spyOn(repo, "getPaymentPushTarget").mockRejectedValue(new Error("database is down"));
    const log = quietLog();
    await expect(sendPaymentPush({ ledger: repo, sender: new FakeFirebase(), log, userId: "demo-user", settlementId: "x", event: "claimed" })).resolves.toBeUndefined();
    expect((log as unknown as { warn: ReturnType<typeof vi.fn> }).warn).toHaveBeenCalledWith(expect.objectContaining({ err: "database is down", event: "claimed" }), "payment push failed");
  });

  it("does not even ask the database when there is no sender", async () => {
    const repo = new MemoryLedgerRepository();
    const spy = vi.spyOn(repo, "getPaymentPushTarget");
    await sendPaymentPush({ ledger: repo, sender: undefined, log: quietLog(), userId: "demo-user", settlementId: "x", event: "claimed" });
    expect(spy).not.toHaveBeenCalled();
  });
});

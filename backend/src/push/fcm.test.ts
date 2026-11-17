import { createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FcmPushSender, parseFirebaseCredentials, type FcmFetcher, type PushMessage } from "./fcm.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const credentials = { projectId: "lena-dena-test", clientEmail: "push@lena-dena-test.iam.gserviceaccount.com", privateKey: privateKey.trim() };
const message: PushMessage = { title: "Sara sent you a reminder", body: "You owe Sara Rs 300 in Trip.", data: { type: "nudge", groupId: "g1" }, channelId: "reminders" };

type Call = { url: string; headers: Record<string, string>; body: string };
type Reply = { status: number; body?: unknown };

/** A stand-in for Google: the token endpoint and messages:send, with a reply chosen per device token. */
function fakeGoogle(replyFor: (token: string) => Reply = () => ({ status: 200, body: { name: "projects/x/messages/1" } }), tokenReply: Reply = { status: 200, body: { access_token: "access-1", expires_in: 3600 } }) {
  const calls: Call[] = [];
  const fetcher: FcmFetcher = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    const reply = url.includes("/token") ? tokenReply : replyFor((JSON.parse(init.body) as { message: { token: string } }).message.token);
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, json: async () => reply.body };
  };
  return { fetcher, calls, tokenCalls: () => calls.filter((call) => call.url.includes("/token")), sendCalls: () => calls.filter((call) => call.url.includes("messages:send")) };
}

describe("parseFirebaseCredentials", () => {
  const file = { type: "service_account", project_id: "lena-dena-test", client_email: credentials.clientEmail, private_key: privateKey };
  it("reads the key file's JSON, and the same JSON in base64", () => {
    expect(parseFirebaseCredentials(JSON.stringify(file))).toEqual(credentials);
    expect(parseFirebaseCredentials(Buffer.from(JSON.stringify(file)).toString("base64"))).toEqual(credentials);
  });
  it("puts back line breaks that arrived as the two characters \\n", () => {
    const flattened = JSON.stringify({ ...file, private_key: privateKey.replaceAll("\n", "\\n") });
    expect(parseFirebaseCredentials(flattened)?.privateKey).toBe(credentials.privateKey);
  });
  it("refuses anything that is not a usable key, without throwing", () => {
    for (const value of [undefined, "", "   ", "not json", "{}", "{\"project_id\":\"x\"}", JSON.stringify({ ...file, private_key: "nope" }), JSON.stringify({ ...file, project_id: "A B" }), JSON.stringify({ ...file, client_email: "no-at-sign" }), "%%%not-base64-either%%%"]) {
      expect(parseFirebaseCredentials(value)).toBeUndefined();
    }
  });
});

describe("FcmPushSender", () => {
  it("signs a request for an access token that Google can verify, then sends with it", async () => {
    const google = fakeGoogle();
    const sender = new FcmPushSender(credentials, { fetcher: google.fetcher, now: () => 1_800_000_000_000 });
    const result = await sender.send(["token-one-aaaaaaaaaaaaaaaaaaaa"], message);
    expect(result).toEqual({ delivered: 1, invalidTokens: [], failed: 0 });
    const form = new URLSearchParams(google.tokenCalls()[0]!.body);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [header, claims, signature] = form.get("assertion")!.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iss: credentials.clientEmail, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: 1_800_000_000, exp: 1_800_003_600 });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(createPublicKey(publicKey), Buffer.from(signature, "base64url"))).toBe(true);
    const sent = google.sendCalls()[0]!;
    expect(sent.url).toBe("https://fcm.googleapis.com/v1/projects/lena-dena-test/messages:send");
    expect(sent.headers.authorization).toBe("Bearer access-1");
    expect(JSON.parse(sent.body)).toEqual({
      message: {
        token: "token-one-aaaaaaaaaaaaaaaaaaaa",
        notification: { title: message.title, body: message.body },
        data: message.data,
        android: { priority: "HIGH", notification: { channel_id: "reminders" } },
        apns: { headers: { "apns-priority": "10" }, payload: { aps: { sound: "default" } } },
      },
    });
  });

  it("never puts the private key in anything it sends", async () => {
    const google = fakeGoogle();
    await new FcmPushSender(credentials, { fetcher: google.fetcher }).send(["token-one-aaaaaaaaaaaaaaaaaaaa"], message);
    for (const call of google.calls) expect(JSON.stringify(call)).not.toContain("PRIVATE KEY");
  });

  it("reuses the access token until shortly before it ends, then asks for a new one", async () => {
    const google = fakeGoogle();
    let clock = 1_800_000_000_000;
    const sender = new FcmPushSender(credentials, { fetcher: google.fetcher, now: () => clock });
    await sender.send(["token-one-aaaaaaaaaaaaaaaaaaaa"], message);
    clock += 30 * 60 * 1000;
    await sender.send(["token-one-aaaaaaaaaaaaaaaaaaaa"], message);
    expect(google.tokenCalls()).toHaveLength(1);
    clock += 31 * 60 * 1000; // 61 minutes in: inside the five-minute renewal margin of a one-hour token
    await sender.send(["token-one-aaaaaaaaaaaaaaaaaaaa"], message);
    expect(google.tokenCalls()).toHaveLength(2);
  });

  it("makes one token exchange for sends that start together", async () => {
    const google = fakeGoogle();
    const sender = new FcmPushSender(credentials, { fetcher: google.fetcher });
    await Promise.all([sender.send(["token-one-aaaaaaaaaaaaaaaaaaaa"], message), sender.send(["token-two-aaaaaaaaaaaaaaaaaaaa"], message)]);
    expect(google.tokenCalls()).toHaveLength(1);
  });

  it("sends once per device, drops repeats, and caps one message at ten devices", async () => {
    const google = fakeGoogle();
    const sender = new FcmPushSender(credentials, { fetcher: google.fetcher });
    const tokens = Array.from({ length: 14 }, (_, index) => `token-${index}-aaaaaaaaaaaaaaaaaaaa`);
    const result = await sender.send([...tokens, tokens[0]!], message);
    expect(result.delivered).toBe(10);
    expect(google.sendCalls()).toHaveLength(10);
  });

  it("does nothing, and asks Google for nothing, when there are no devices", async () => {
    const google = fakeGoogle();
    expect(await new FcmPushSender(credentials, { fetcher: google.fetcher }).send([], message)).toEqual({ delivered: 0, invalidTokens: [], failed: 0 });
    expect(google.calls).toHaveLength(0);
  });

  it("reports a token Firebase no longer knows, and counts the rest", async () => {
    const google = fakeGoogle((token) => token.startsWith("gone")
      ? { status: 404, body: { error: { code: 404, status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } } }
      : token.startsWith("garbled")
        ? { status: 400, body: { error: { code: 400, status: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token" } } }
        : token.startsWith("busy") ? { status: 503, body: {} } : { status: 200, body: {} });
    const result = await new FcmPushSender(credentials, { fetcher: google.fetcher }).send(["gone-aaaaaaaaaaaaaaaaaaaaaaaa", "garbled-aaaaaaaaaaaaaaaaaaaaaa", "busy-aaaaaaaaaaaaaaaaaaaaaaaaa", "fine-aaaaaaaaaaaaaaaaaaaaaaaaa"], message);
    expect(result.delivered).toBe(1);
    expect(result.failed).toBe(1);
    expect([...result.invalidTokens].sort()).toEqual(["garbled-aaaaaaaaaaaaaaaaaaaaaa", "gone-aaaaaaaaaaaaaaaaaaaaaaaa"]);
  });

  it("does not call a bad payload (400 about something else) a dead token", async () => {
    const google = fakeGoogle(() => ({ status: 400, body: { error: { status: "INVALID_ARGUMENT", message: "Invalid value at message.data" } } }));
    const result = await new FcmPushSender(credentials, { fetcher: google.fetcher }).send(["token-one-aaaaaaaaaaaaaaaaaaaa"], message);
    expect(result).toEqual({ delivered: 0, invalidTokens: [], failed: 1 });
  });

  it("fails every device, without throwing, when Google refuses the service account", async () => {
    const google = fakeGoogle(undefined, { status: 400, body: { error: "invalid_grant" } });
    const result = await new FcmPushSender(credentials, { fetcher: google.fetcher }).send(["token-one-aaaaaaaaaaaaaaaaaaaa", "token-two-aaaaaaaaaaaaaaaaaaaa"], message);
    expect(result).toEqual({ delivered: 0, invalidTokens: [], failed: 2 });
    expect(google.sendCalls()).toHaveLength(0);
  });

  it("forgets a refused access token so the next send signs a new request", async () => {
    let refuse = true;
    const google = fakeGoogle(() => (refuse ? { status: 401, body: { error: { status: "UNAUTHENTICATED" } } } : { status: 200, body: {} }));
    const sender = new FcmPushSender(credentials, { fetcher: google.fetcher });
    expect((await sender.send(["token-one-aaaaaaaaaaaaaaaaaaaa"], message)).failed).toBe(1);
    refuse = false;
    expect((await sender.send(["token-one-aaaaaaaaaaaaaaaaaaaa"], message)).delivered).toBe(1);
    expect(google.tokenCalls()).toHaveLength(2);
  });

  it("counts a network failure as a failed device, not a crash", async () => {
    const fetcher: FcmFetcher = async (url) => {
      if (url.includes("/token")) return { ok: true, status: 200, json: async () => ({ access_token: "a", expires_in: 3600 }) };
      throw new Error("socket hang up");
    };
    expect(await new FcmPushSender(credentials, { fetcher }).send(["token-one-aaaaaaaaaaaaaaaaaaaa"], message)).toEqual({ delivered: 0, invalidTokens: [], failed: 1 });
  });
});

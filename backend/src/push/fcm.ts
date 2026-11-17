import { createSign } from "node:crypto";

/**
 * Firebase Cloud Messaging through the HTTP v1 API, with no Firebase SDK: a service-account JWT (RS256, signed with
 * node:crypto) is exchanged at Google's token endpoint for a short-lived access token, which is cached until shortly
 * before it ends (a warm serverless function reuses it), and each device gets one `messages:send` call.
 *
 * The service account needs only the "Firebase Cloud Messaging API Admin" role. Its key never leaves the server and is
 * never logged; a token that Firebase says no longer exists is reported back so the caller can delete it.
 */

export type FirebaseCredentials = { projectId: string; clientEmail: string; privateKey: string };

export type PushMessage = {
  title: string;
  body: string;
  /** Delivered with the notification so a tap can open the right screen. FCM data values must be strings. */
  data: Record<string, string>;
  /** Android notification channel (created by the app); Android 8+ ignores the message without a real one. */
  channelId: string;
};

export type PushResult = {
  /** Devices Firebase accepted the message for. */
  delivered: number;
  /** Tokens Firebase says are not valid any more (app uninstalled, token expired). The caller deletes them. */
  invalidTokens: string[];
  /** Devices that could not be reached for any other reason (Firebase down, rate limited, credentials wrong). */
  failed: number;
};

export interface PushSender {
  send(tokens: string[], message: PushMessage): Promise<PushResult>;
}

/** The small part of a Fetch response the sender needs; structural so the Node and web `Response` types cannot clash. */
type FcmFetchResponse = { ok: boolean; status: number; json(): Promise<unknown> };
export type FcmFetcher = (url: string, init: { method: "POST"; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<FcmFetchResponse>;

export type FcmOptions = {
  fetcher?: FcmFetcher;
  /** Clock in milliseconds; tests move it to check that the access token is cached and renewed. */
  now?: () => number;
  /** Per request, so one slow call cannot hold the API's own request open. */
  timeoutMs?: number;
  tokenUrl?: string;
  apiBase?: string;
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://fcm.googleapis.com";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
/** Renew the access token this long before it ends, so a call never starts with one that is about to expire. */
const RENEW_MARGIN_MS = 5 * 60 * 1000;
/** The most devices one message goes to; the database already keeps at most 10 per person. */
const MAX_TOKENS = 10;

const base64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

/** What `FIREBASE_SERVICE_ACCOUNT_JSON` may hold: the key file's JSON, or that JSON in base64. Undefined when unusable. */
export function parseFirebaseCredentials(raw: string | undefined): FirebaseCredentials | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  let json = text;
  if (!text.startsWith("{")) {
    try { json = Buffer.from(text, "base64").toString("utf8"); } catch { return undefined; }
  }
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const projectId = typeof parsed.project_id === "string" ? parsed.project_id.trim() : "";
    const clientEmail = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
    // A key pasted through a form often arrives with its line breaks as the two characters \n: put them back.
    const privateKey = typeof parsed.private_key === "string" ? parsed.private_key.replace(/\\n/g, "\n").trim() : "";
    if (!/^[a-z0-9][a-z0-9-]{3,}$/.test(projectId) || !/^[^\s@]+@[^\s@]+$/.test(clientEmail) || !privateKey.includes("PRIVATE KEY")) return undefined;
    return { projectId, clientEmail, privateKey };
  } catch {
    return undefined;
  }
}

export class FcmPushSender implements PushSender {
  private readonly fetcher: FcmFetcher;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly tokenUrl: string;
  private readonly apiBase: string;
  private cached: { value: string; expiresAt: number } | undefined;
  private pending: Promise<string> | undefined;

  constructor(private readonly credentials: FirebaseCredentials, options: FcmOptions = {}) {
    this.fetcher = options.fetcher ?? (fetch as unknown as FcmFetcher);
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.tokenUrl = options.tokenUrl ?? TOKEN_URL;
    this.apiBase = options.apiBase ?? API_BASE;
  }

  /** The signed request for an access token (the "JWT bearer" grant of Google's OAuth 2.0 for service accounts). */
  private assertion(): string {
    const issuedAt = Math.floor(this.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(JSON.stringify({ iss: this.credentials.clientEmail, scope: SCOPE, aud: this.tokenUrl, iat: issuedAt, exp: issuedAt + 3600 }));
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    return `${header}.${claims}.${signer.sign(this.credentials.privateKey).toString("base64url")}`;
  }

  private async accessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt - RENEW_MARGIN_MS > this.now()) return this.cached.value;
    // Several sends at once share one exchange.
    this.pending ??= this.exchange().finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async exchange(): Promise<string> {
    const response = await this.fetcher(this.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: this.assertion() }).toString(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const payload = await response.json().catch(() => null) as { access_token?: unknown; expires_in?: unknown } | null;
    if (!response.ok || typeof payload?.access_token !== "string") throw new Error(`Google refused the service account (${response.status})`);
    const lifetime = typeof payload.expires_in === "number" && payload.expires_in > 0 ? payload.expires_in : 3600;
    this.cached = { value: payload.access_token, expiresAt: this.now() + lifetime * 1000 };
    return payload.access_token;
  }

  async send(tokens: string[], message: PushMessage): Promise<PushResult> {
    const unique = Array.from(new Set(tokens)).slice(0, MAX_TOKENS);
    const result: PushResult = { delivered: 0, invalidTokens: [], failed: 0 };
    if (unique.length === 0) return result;
    let accessToken: string;
    try {
      accessToken = await this.accessToken();
    } catch {
      return { ...result, failed: unique.length };
    }
    await Promise.all(unique.map(async (token) => {
      const outcome = await this.sendOne(accessToken, token, message);
      if (outcome === "ok") result.delivered += 1;
      else if (outcome === "invalid") result.invalidTokens.push(token);
      else result.failed += 1;
    }));
    return result;
  }

  private async sendOne(accessToken: string, token: string, message: PushMessage): Promise<"ok" | "invalid" | "failed"> {
    try {
      const response = await this.fetcher(`${this.apiBase}/v1/projects/${encodeURIComponent(this.credentials.projectId)}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: message.title, body: message.body },
            data: message.data,
            android: { priority: "HIGH", notification: { channel_id: message.channelId } },
            apns: { headers: { "apns-priority": "10" }, payload: { aps: { sound: "default" } } },
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.ok) return "ok";
      const error = await response.json().catch(() => null) as { error?: { status?: unknown; message?: unknown; details?: Array<{ errorCode?: unknown }> } } | null;
      const code = error?.error?.details?.map((detail) => detail.errorCode).find((value) => typeof value === "string");
      const text = typeof error?.error?.message === "string" ? error.error.message : "";
      // The token itself is bad: FCM answers 404 UNREGISTERED once the app is gone, and 400 INVALID_ARGUMENT naming the token.
      if (response.status === 404 || code === "UNREGISTERED" || (response.status === 400 && /registration token|not a valid fcm/i.test(text))) return "invalid";
      // A refused credential must not stay cached: the next call signs a new request.
      if (response.status === 401 || response.status === 403) this.cached = undefined;
      return "failed";
    } catch {
      return "failed";
    }
  }
}

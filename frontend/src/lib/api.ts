import { supabase } from "@/lib/supabase";
import { Platform } from "react-native";

const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

type ApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  idempotencyKey?: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** How long a request may take before the app gives up, so a stuck server never leaves a spinner running forever. */
export const REQUEST_TIMEOUT_MS = 20_000;
/** Uploads carry a photo, so they get longer. */
export const UPLOAD_TIMEOUT_MS = 45_000;

/** The server did not answer in time. The request may still have reached it, so a retry reuses its idempotency key. */
export class RequestTimeoutError extends Error {
  constructor() {
    super("This is taking too long. Check your connection and try again.");
  }
}

/** Rejects with `RequestTimeoutError` if `work` has not finished after `ms`; `onTimeout` stops the underlying request. */
export async function withTimeout<T>(work: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new RequestTimeoutError());
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** A user-facing sentence for any thrown value; fetch failures become a connection hint. */
export function errorMessage(error: unknown, fallback = "Please try again.") {
  if (error instanceof TypeError && /network request failed|failed to fetch|load failed/i.test(error.message)) {
    return "LenaDena can't reach its server. Check your connection and try again.";
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

async function authHeaders() {
  const headers: Record<string, string> = {};
  if (supabase) {
    // Reading the session can wait on a token refresh over the network, so it is bounded too.
    const { data } = await withTimeout(supabase.auth.getSession(), REQUEST_TIMEOUT_MS);
    if (data.session?.access_token) {
      headers.authorization = `Bearer ${data.session.access_token}`;
      return headers;
    }
    return headers;
  }
  headers["x-user-id"] = "demo-user";
  return headers;
}

/**
 * Keys of writes that got no answer (timeout, no connection), by what was sent. The server may have saved the entry
 * anyway, so when the person taps Save again with the same details the same key is sent and the server answers with
 * the entry it already has instead of adding a second one. Any answer from the server (success or error) clears it.
 */
const unanswered = new Map<string, string>();

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  if (options.idempotencyKey) {
    const fingerprint = `${options.method ?? "GET"} ${path} ${JSON.stringify(options.body ?? null)}`;
    const key = unanswered.get(fingerprint) ?? options.idempotencyKey;
    try {
      const result = await send<T>(path, { ...options, idempotencyKey: key });
      unanswered.delete(fingerprint);
      return result;
    } catch (error) {
      if (error instanceof ApiError) unanswered.delete(fingerprint);
      else unanswered.set(fingerprint, key);
      throw error;
    }
  }
  return send<T>(path, options);
}

async function send<T>(path: string, options: ApiOptions): Promise<T> {
  const hasJsonBody = options.body !== undefined;
  const headers = {
    ...(hasJsonBody ? { "content-type": "application/json" } : {}),
    ...(await authHeaders()),
    ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
    ...(options.headers ?? {}),
  };
  const controller = new AbortController();
  const response = await withTimeout(
    fetch(`${apiUrl}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
      body: hasJsonBody ? JSON.stringify(options.body) : undefined,
    }),
    REQUEST_TIMEOUT_MS,
    () => controller.abort(),
  );
  const payload = (await withTimeout(response.json().catch(() => null), REQUEST_TIMEOUT_MS)) as T | { message?: string; code?: string; details?: unknown } | null;
  if (!response.ok) {
    const error = payload as { message?: string; code?: string; details?: unknown } | null;
    throw new ApiError(error?.message ?? "Request failed", response.status, error?.code, error?.details);
  }
  return payload as T;
}

/** A download: the response body as text (a file), with the same sign-in headers and error handling as `apiRequest`. */
export async function apiText(path: string): Promise<string> {
  const controller = new AbortController();
  const response = await withTimeout(fetch(`${apiUrl}${path}`, { headers: await authHeaders(), signal: controller.signal }), REQUEST_TIMEOUT_MS, () => controller.abort());
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string; code?: string; details?: unknown } | null;
    throw new ApiError(error?.message ?? "Request failed", response.status, error?.code, error?.details);
  }
  return response.text();
}

export function newIdempotencyKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type VoiceTranscriptionLanguage = "en" | "ur";

/** Uploads a short temporary recording to our authenticated backend. The backend holds the Deepgram key. */
export async function transcribeVoiceAudio(uri: string, language: VoiceTranscriptionLanguage) {
  const url = `${apiUrl}/v1/voice/transcribe?language=${language}`;
  const headers = await authHeaders();
  const form = new FormData();
  let status: number;
  let text: string;
  if (Platform.OS === "web") {
    const file = await fetch(uri).then((response) => response.blob());
    form.append("audio", file, "voice-command.webm");
    const response = await fetch(url, { method: "POST", headers, body: form, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
    status = response.status;
    text = await response.text();
  } else {
    form.append("audio", { uri, name: "voice-command.m4a", type: "audio/m4a" } as unknown as Blob);
    ({ status, text } = await postNativeForm(url, headers, form));
  }
  const payload = parseJson(text) as { transcript?: string; message?: string; code?: string; details?: unknown } | null;
  if (status < 200 || status >= 300 || !payload?.transcript) {
    throw new ApiError(payload?.message ?? "Voice transcription failed", status, payload?.code, payload?.details);
  }
  return payload.transcript;
}

export async function uploadPrivateImage(kind: "receipt" | "payment-proof" | "avatar", uri: string) {
  if (!supabase) return uri;
  const match = uri.toLowerCase().match(/\.(png|webp|jpe?g)(?:\?|$)/);
  const extension = match?.[1] === "png" ? "png" : match?.[1] === "webp" ? "webp" : "jpg";
  const contentType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
  const url = `${apiUrl}/v1/uploads/${kind}`;
  const headers = await authHeaders();
  const form = new FormData();
  let status: number;
  let text: string;
  if (Platform.OS === "web") {
    const fileResponse = await fetch(uri);
    form.append("file", await fileResponse.blob(), `${kind}.${extension}`);
    const response = await fetch(url, { method: "POST", headers, body: form, signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
    status = response.status;
    text = await response.text();
  } else {
    form.append("file", { uri, name: `${kind}.${extension}`, type: contentType } as unknown as Blob);
    ({ status, text } = await postNativeForm(url, headers, form));
  }
  const payload = parseJson(text) as { path?: string; message?: string; code?: string } | null;
  if (status === 501) return uri;
  if (status < 200 || status >= 300 || !payload?.path) {
    throw new ApiError(payload?.message ?? "Image upload failed", status, payload?.code, payload);
  }
  return payload.path;
}

/**
 * Expo replaces the global `fetch` with `expo/fetch`, which throws "Unsupported FormDataPart implementation"
 * for React Native's `{ uri, name, type }` file parts. React Native's own XMLHttpRequest still reads the
 * local file natively and writes the multipart boundary, so native uploads go through it.
 */
function postNativeForm(url: string, headers: Record<string, string>, form: FormData) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.timeout = UPLOAD_TIMEOUT_MS;
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.onload = () => resolve({ status: request.status, text: request.responseText });
    // Same message as a failed fetch, so errorMessage() shows the connection hint.
    request.onerror = () => reject(new TypeError("Network request failed"));
    request.ontimeout = () => reject(new TypeError("Network request failed"));
    request.send(form);
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

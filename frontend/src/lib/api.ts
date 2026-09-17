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
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      headers.authorization = `Bearer ${data.session.access_token}`;
      return headers;
    }
    return headers;
  }
  headers["x-user-id"] = "demo-user";
  return headers;
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const hasJsonBody = options.body !== undefined;
  const headers = {
    ...(hasJsonBody ? { "content-type": "application/json" } : {}),
    ...(await authHeaders()),
    ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
    ...(options.headers ?? {}),
  };
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers,
    body: hasJsonBody ? JSON.stringify(options.body) : undefined,
  });
  const payload = (await response.json().catch(() => null)) as T | { message?: string; code?: string; details?: unknown } | null;
  if (!response.ok) {
    const error = payload as { message?: string; code?: string; details?: unknown } | null;
    throw new ApiError(error?.message ?? "Request failed", response.status, error?.code, error?.details);
  }
  return payload as T;
}

export function newIdempotencyKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
    const response = await fetch(url, { method: "POST", headers, body: form });
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

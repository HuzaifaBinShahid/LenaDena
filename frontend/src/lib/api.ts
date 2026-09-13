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
    readonly details?: unknown,
  ) {
    super(message);
  }
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
  const headers = {
    "content-type": "application/json",
    ...(await authHeaders()),
    ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
    ...(options.headers ?? {}),
  };
  const response = await fetch(`${apiUrl}${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = (await response.json().catch(() => null)) as T | { message?: string; details?: unknown } | null;
  if (!response.ok) {
    const error = payload as { message?: string; details?: unknown } | null;
    throw new ApiError(error?.message ?? "Request failed", response.status, error?.details);
  }
  return payload as T;
}

export function newIdempotencyKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function uploadPrivateImage(kind: "receipt" | "payment-proof", uri: string) {
  if (!supabase) return uri;
  const match = uri.toLowerCase().match(/\.(png|webp|jpe?g)(?:\?|$)/);
  const extension = match?.[1] === "png" ? "png" : match?.[1] === "webp" ? "webp" : "jpg";
  const contentType = extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg";
  const form = new FormData();
  if (Platform.OS === "web") {
    const fileResponse = await fetch(uri);
    form.append("file", await fileResponse.blob(), `${kind}.${extension}`);
  } else {
    form.append("file", { uri, name: `${kind}.${extension}`, type: contentType } as unknown as Blob);
  }
  const response = await fetch(`${apiUrl}/v1/uploads/${kind}`, {
    method: "POST",
    headers: await authHeaders(),
    body: form,
  });
  const payload = await response.json().catch(() => null) as { path?: string; message?: string } | null;
  if (response.status === 501) return uri;
  if (!response.ok || !payload?.path) {
    throw new ApiError(payload?.message ?? "Image upload failed", response.status, payload);
  }
  return payload.path;
}

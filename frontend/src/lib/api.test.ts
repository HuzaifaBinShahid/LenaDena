import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("@/lib/supabase", () => ({ supabase: null }));

import { apiRequest, ApiError, errorMessage, REQUEST_TIMEOUT_MS, RequestTimeoutError, withTimeout } from "./api";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

/** A fetch that never answers (a hung server) but honours abort, like the real one. */
function hungFetch() {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>(() => { void init; }));
}

describe("withTimeout", () => {
  it("rejects with a plain message after the time, and stops the request", async () => {
    const stop = vi.fn();
    const pending = withTimeout(new Promise<never>(() => undefined), 1000, stop);
    const assertion = expect(pending).rejects.toBeInstanceOf(RequestTimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(stop).toHaveBeenCalledOnce();
  });
  it("passes the result through when it is in time", async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });
});

describe("apiRequest", () => {
  it("gives up on a server that never answers instead of spinning forever, and says so", async () => {
    vi.stubGlobal("fetch", hungFetch());
    const pending = apiRequest("/v1/personal-transactions", { method: "POST", body: { a: 1 }, idempotencyKey: "key-1" });
    const assertion = expect(pending).rejects.toThrow("taking too long");
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await assertion;
    expect(errorMessage(new RequestTimeoutError())).toContain("taking too long");
  });

  it("sends the same idempotency key when the same details are saved again after no answer", async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push((init?.headers as Record<string, string>)["idempotency-key"] ?? "");
      if (seen.length === 1) throw new TypeError("Network request failed");
      return new Response(JSON.stringify({ id: "x" }), { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const body = { title: "Red rock", amountMinor: 85000 };
    await expect(apiRequest("/v1/personal-transactions", { method: "POST", body, idempotencyKey: "first-key" })).rejects.toThrow();
    await apiRequest("/v1/personal-transactions", { method: "POST", body, idempotencyKey: "second-key" });
    expect(seen).toEqual(["first-key", "first-key"]);
    // Once the server has answered, the next save is a new entry with a new key.
    await apiRequest("/v1/personal-transactions", { method: "POST", body, idempotencyKey: "third-key" });
    expect(seen[2]).toBe("third-key");
  });

  it("uses a fresh key after the server answered with an error", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push((init?.headers as Record<string, string>)["idempotency-key"] ?? "");
      return new Response(JSON.stringify({ message: "No" }), { status: 400 });
    }));
    const body = { n: 1 };
    await expect(apiRequest("/v1/x", { method: "POST", body, idempotencyKey: "k1" })).rejects.toBeInstanceOf(ApiError);
    await expect(apiRequest("/v1/x", { method: "POST", body, idempotencyKey: "k2" })).rejects.toBeInstanceOf(ApiError);
    expect(seen).toEqual(["k1", "k2"]);
  });
});

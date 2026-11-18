import { describe, expect, it } from "vitest";
import { googleCallName, runWithTrace, summarize, supabaseCallName, traced, type UpstreamTrace } from "./upstream.js";

const ok = (status = 200) => Promise.resolve({ status });

describe("traced", () => {
  it("times a call and records it in the trace of the request that made it, also after an await", async () => {
    let clock = 0;
    const now = () => clock;
    const slow = traced(async (_url: string) => { clock += 250; await Promise.resolve(); return { status: 200 }; }, () => "db rpc app_get_plan", now);
    const trace: UpstreamTrace = { calls: [] };
    await runWithTrace(trace, async () => {
      await Promise.resolve();
      await slow("https://x.supabase.co/rest/v1/rpc/app_get_plan");
    });
    expect(trace.calls).toEqual([{ name: "db rpc app_get_plan", ms: 250, status: 200 }]);
  });

  it("keeps two overlapping requests apart", async () => {
    const call = traced(async (_name: string) => { await new Promise((resolve) => { setTimeout(resolve, 5); }); return { status: 200 }; }, (name) => name);
    const first: UpstreamTrace = { calls: [] };
    const second: UpstreamTrace = { calls: [] };
    await Promise.all([runWithTrace(first, () => call("first")), runWithTrace(second, () => call("second"))]);
    expect(first.calls.map((entry) => entry.name)).toEqual(["first"]);
    expect(second.calls.map((entry) => entry.name)).toEqual(["second"]);
  });

  it("records a call that never got an answer, and still throws the error", async () => {
    const boom = traced(async (_url: string): Promise<{ status: number }> => { throw new Error("socket hang up"); }, () => "auth user");
    const trace: UpstreamTrace = { calls: [] };
    await expect(runWithTrace(trace, () => boom("x"))).rejects.toThrow("socket hang up");
    expect(trace.calls).toEqual([expect.objectContaining({ name: "auth user", status: "error" })]);
  });

  it("works outside a request and never changes the answer", async () => {
    const call = traced((_url: string) => ok(204), () => "x");
    await expect(call("y")).resolves.toEqual({ status: 204 });
  });

  it("survives a naming function that throws", async () => {
    const trace: UpstreamTrace = { calls: [] };
    await runWithTrace(trace, () => traced((_url: string) => ok(), () => { throw new Error("bad url"); })("z"));
    expect(trace.calls[0]?.name).toBe("unknown");
  });

  it("stops growing a trace at 50 calls", async () => {
    const call = traced((_url: string) => ok(), () => "x");
    const trace: UpstreamTrace = { calls: [] };
    await runWithTrace(trace, async () => { for (let i = 0; i < 80; i += 1) await call("y"); });
    expect(trace.calls).toHaveLength(50);
  });
});

describe("call names", () => {
  it("names a database function and nothing else of the address", () => {
    expect(supabaseCallName("https://abc.supabase.co/rest/v1/rpc/app_create_nudge?x=secret")).toBe("db rpc app_create_nudge");
    expect(supabaseCallName(new URL("https://abc.supabase.co/rest/v1/rpc/app_get_plan"))).toBe("db rpc app_get_plan");
    expect(supabaseCallName({ url: "https://abc.supabase.co/rest/v1/rpc/app_get_plan" })).toBe("db rpc app_get_plan");
    expect(supabaseCallName("https://abc.supabase.co/rest/v1/people?select=*")).toBe("db rest");
  });
  it("names auth calls by kind and drops ids", () => {
    expect(supabaseCallName("https://abc.supabase.co/auth/v1/user")).toBe("auth user");
    expect(supabaseCallName("https://abc.supabase.co/auth/v1/health")).toBe("auth health");
    expect(supabaseCallName("https://abc.supabase.co/auth/v1/admin/users/3f2b8c0e-1111-2222-3333-444455556666")).toBe("auth admin");
  });
  it("names storage calls without the bucket path or file name", () => {
    expect(supabaseCallName("https://abc.supabase.co/storage/v1/object/receipts/3f2b8c0e/secret-photo.jpg")).toBe("storage");
  });
  it("never lets odd characters through, and copes with an address that is not one", () => {
    expect(supabaseCallName("https://abc.supabase.co/rest/v1/rpc/app_x;drop%20table")).toBe("db rpc app_xdrop20table");
    expect(supabaseCallName("not a url")).toBe("supabase");
    expect(supabaseCallName(undefined)).toBe("supabase");
  });
  it("names the two Google hosts the push sender uses", () => {
    expect(googleCallName("https://oauth2.googleapis.com/token")).toBe("fcm token");
    expect(googleCallName("https://fcm.googleapis.com/v1/projects/p/messages:send")).toBe("fcm send");
    expect(googleCallName("https://example.org/x")).toBe("example.org");
    expect(googleCallName("nonsense")).toBe("google");
  });
});

describe("summarize", () => {
  it("adds up the time, lists the slowest first and cuts the list", () => {
    const trace: UpstreamTrace = { calls: [
      { name: "a", ms: 10, status: 200 }, { name: "b", ms: 300, status: 200 }, { name: "c", ms: 50, status: 200 },
    ] };
    expect(summarize(trace, 2)).toEqual({ upstreamMs: 360, failed: false, calls: 3, slowest: ["b 300ms", "c 50ms"] });
  });
  it("flags calls that failed or got a server error", () => {
    expect(summarize({ calls: [{ name: "a", ms: 5, status: "error" }] }).failed).toBe(true);
    expect(summarize({ calls: [{ name: "a", ms: 5, status: 503 }] }).slowest).toEqual(["a 5ms failed(503)"]);
    expect(summarize({ calls: [{ name: "a", ms: 5, status: 404 }] }).failed).toBe(false);
  });
  it("is empty for a request that called nothing", () => {
    expect(summarize({ calls: [] })).toEqual({ upstreamMs: 0, failed: false, calls: 0, slowest: [] });
  });
});

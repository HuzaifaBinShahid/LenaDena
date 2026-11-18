import { Writable } from "node:stream";
import Fastify, { LogController } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { traced } from "../observability/upstream.js";
import { timingPlugin } from "./timing.js";

type Line = Record<string, unknown>;

const apps: Array<{ close(): Promise<unknown> }> = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

/** A small server with the timing plugin and a few routes, writing its log lines into an array. */
async function server(slowMs = 1500) {
  const lines: Line[] = [];
  const stream = new Writable({ write(chunk, _encoding, done) { for (const text of String(chunk).split("\n").filter(Boolean)) lines.push(JSON.parse(text) as Line); done(); } });
  const app = Fastify({ logger: { level: "info", stream }, logController: new LogController({ disableRequestLogging: () => true }) });
  apps.push(app);
  await app.register(timingPlugin, { slowMs });
  const fastDb = traced(async (_url: string) => ({ status: 200 }), () => "db rpc app_get_plan");
  const brokenAuth = traced(async (_url: string): Promise<{ status: number }> => { throw new Error("socket hang up"); }, () => "auth user");
  const slowFirebase = traced(async (_url: string) => { await new Promise((resolve) => { setTimeout(resolve, 60); }); return { status: 200 }; }, () => "fcm send");
  app.get("/things/:id", async (request) => { await fastDb("x"); return { id: (request.params as { id: string }).id }; });
  app.get("/plain", async () => ({ ok: true }));
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/slow", async () => { await slowFirebase("x"); return { ok: true }; });
  app.get("/broken", async () => { await brokenAuth("x").catch(() => undefined); return { ok: true }; });
  app.get("/boom", async () => { throw new Error("kaput"); });
  await app.ready();
  const requestLines = () => lines.filter((line) => typeof line.route === "string");
  return { app, lines, requestLines };
}

describe("timing plugin", () => {
  it("writes one line per request with the route pattern, status and time, and nothing from Fastify's own two lines", async () => {
    const { app, lines } = await server();
    await app.inject({ method: "GET", url: "/plain" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ msg: "request", method: "GET", route: "/plain", status: 200, level: 30 });
    expect(typeof lines[0]?.ms).toBe("number");
    expect(lines[0]).not.toHaveProperty("upstream");
    expect(typeof lines[0]?.reqId).toBe("string");
  });

  it("logs the route pattern, not the address that was called, so ids and tokens stay out of the logs", async () => {
    const { app, lines } = await server();
    await app.inject({ method: "GET", url: "/things/invite-token-SECRET123?code=abc" });
    expect(lines[0]?.route).toBe("/things/:id");
    expect(JSON.stringify(lines)).not.toContain("SECRET123");
    expect(JSON.stringify(lines)).not.toContain("code=abc");
  });

  it("shows the calls the request made to other services and the time they took", async () => {
    const { app, lines } = await server();
    await app.inject({ method: "GET", url: "/things/1" });
    expect(lines[0]).toMatchObject({ route: "/things/:id", upstream: [expect.stringMatching(/^db rpc app_get_plan \d+ms$/)] });
    expect(typeof lines[0]?.upstreamMs).toBe("number");
  });

  it("warns, naming the slow call, when a request takes at least the threshold", async () => {
    const { app, lines } = await server(40);
    await app.inject({ method: "GET", url: "/slow" });
    expect(lines[0]).toMatchObject({ level: 40, msg: "slow request", route: "/slow" });
    expect((lines[0]?.upstream as string[])[0]).toMatch(/^fcm send \d+ms$/);
    expect(Number(lines[0]?.upstreamMs)).toBeGreaterThanOrEqual(50);
    expect(Number(lines[0]?.ms)).toBeGreaterThanOrEqual(40);
  });

  it("does not warn for a request under the threshold", async () => {
    const { app, lines } = await server(5000);
    await app.inject({ method: "GET", url: "/slow" });
    expect(lines[0]).toMatchObject({ level: 30, msg: "request" });
  });

  it("warns when a call to another service failed, even if the request was fast", async () => {
    const { app, lines } = await server();
    await app.inject({ method: "GET", url: "/broken" });
    expect(lines[0]).toMatchObject({ level: 40, msg: "request with a failed call to another service" });
    expect((lines[0]?.upstream as string[])[0]).toMatch(/^auth user \d+ms failed\(error\)$/);
  });

  it("does not log the shallow health check, which is polled all day", async () => {
    const { app, lines } = await server();
    await app.inject({ method: "GET", url: "/health" });
    expect(lines).toHaveLength(0);
  });

  it("logs a request that matched no route by its path without the query string, cut short", async () => {
    const { app, lines } = await server();
    await app.inject({ method: "GET", url: `/nope/${"a".repeat(300)}?token=SECRET` });
    expect(lines[0]).toMatchObject({ status: 404 });
    const route = String(lines[0]?.route);
    expect(route.startsWith("(no route) /nope/")).toBe(true);
    expect(route.length).toBeLessThan(130);
    expect(route).not.toContain("SECRET");
  });

  it("logs a failing request with its status too (the error itself is logged by the app's error handler)", async () => {
    const { app, requestLines } = await server();
    await app.inject({ method: "GET", url: "/boom" });
    expect(requestLines().some((line) => line.route === "/boom" && line.status === 500)).toBe(true);
  });

  it("keeps the calls of overlapping requests apart", async () => {
    const { app, requestLines } = await server();
    await Promise.all([app.inject({ method: "GET", url: "/slow" }), app.inject({ method: "GET", url: "/things/1" })]);
    const byRoute = new Map(requestLines().map((line) => [line.route, line]));
    expect((byRoute.get("/slow")?.upstream as string[]).every((entry) => entry.startsWith("fcm send"))).toBe(true);
    expect((byRoute.get("/things/:id")?.upstream as string[]).every((entry) => entry.startsWith("db rpc"))).toBe(true);
  });
});

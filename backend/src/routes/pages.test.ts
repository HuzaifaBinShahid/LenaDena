import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import type { AppConfig } from "../config.js";
import { POLICY_UPDATED } from "../pages/layout.js";

const openApps: FastifyInstance[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

async function appWith(config: Partial<AppConfig> = {}) {
  const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo", ...config } });
  openApps.push(app);
  return app;
}

const get = (app: FastifyInstance, url: string) => app.inject({ method: "GET", url });
const PAGES = ["/privacy", "/delete-account"] as const;

describe("public pages", () => {
  it.each(PAGES)("%s opens without signing in, as cached HTML", async (path) => {
    const app = await appWith({ authMode: "supabase", supabaseUrl: "https://example.supabase.co", supabaseSecretKey: "service-role-key" });
    const response = await get(app, path);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.headers["cache-control"]).toBe("public, max-age=300");
    expect(response.body.startsWith("<!doctype html>")).toBe(true);
    expect(response.body).toContain('<html lang="en">');
    expect((await app.inject({ method: "HEAD", url: path })).statusCode).toBe(200);
  });

  it.each(PAGES)("%s loads nothing from outside and runs no script", async (path) => {
    const body = (await get(await appWith({ supportEmail: "help@example.com" }), path)).body;
    expect(body).not.toMatch(/<script/i);
    expect(body).not.toMatch(/\bon[a-z]+\s*=/i);
    expect(body).not.toMatch(/\b(?:src|srcset)\s*=/i);
    expect(body).not.toMatch(/https?:\/\//i);
    expect(body).not.toMatch(/<link[^>]+stylesheet/i);
  });

  it("keeps the API closed: only these routes are public, and /v1 still needs a token", async () => {
    const app = await appWith({ authMode: "supabase", supabaseUrl: "https://example.supabase.co", supabaseSecretKey: "service-role-key" });
    expect((await get(app, "/v1/me/plan")).statusCode).toBe(401);
    expect((await get(app, "/privacy/extra")).statusCode).toBe(404);
  });

  it("is not part of the API documentation", async () => {
    const app = await appWith();
    await app.ready();
    const paths = Object.keys((app.swagger() as { paths?: Record<string, unknown> }).paths ?? {});
    expect(paths).not.toContain("/privacy");
    expect(paths).not.toContain("/delete-account");
  });

  it("still renders under the production content security policy (inline styles allowed, scripts not)", async () => {
    const response = await get(await appWith({ nodeEnv: "production" }), "/privacy");
    expect(response.statusCode).toBe(200);
    const csp = String(response.headers["content-security-policy"]);
    expect(csp).toMatch(/style-src [^;]*'unsafe-inline'/);
    expect(csp).toMatch(/script-src 'self'(;|$)/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });
});

describe("contact details", () => {
  it("shows the configured address as a mail link with a ready subject, and the operator's name", async () => {
    const app = await appWith({ supportEmail: "help@example.com", operatorName: "Example Studio" });
    for (const [path, subject] of [["/privacy", "LenaDena%20privacy%20question"], ["/delete-account", "Delete%20my%20LenaDena%20account"]] as const) {
      const body = (await get(app, path)).body;
      expect(body).toContain(`href="mailto:help@example.com?subject=${subject}"`);
      expect(body).toContain("Example Studio");
    }
  });

  it("says plainly that no address is published yet, instead of leaving a dead link", async () => {
    const app = await appWith();
    const privacy = (await get(app, "/privacy")).body;
    const deletion = (await get(app, "/delete-account")).body;
    expect(privacy).not.toContain("mailto:");
    expect(privacy).toContain("not published on this page yet");
    expect(privacy).toContain("the LenaDena team");
    expect(deletion).not.toContain("mailto:");
    expect(deletion).toContain("requests by email are not available right now");
    // The in-app route is still described in full.
    expect(deletion).toContain("Delete account");
  });

  it("escapes whatever the settings contain", async () => {
    const body = (await get(await appWith({ operatorName: '<script>alert("x")</script> & Co', supportEmail: "a+b@example.com" }), "/privacy")).body;
    expect(body).not.toMatch(/<script/i);
    expect(body).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; Co");
    expect(body).toContain('mailto:a+b@example.com?subject=');
  });
});

describe("what the pages promise", () => {
  it("the deletion page matches what the deletion does", async () => {
    const body = (await get(await appWith({ supportEmail: "help@example.com" }), "/delete-account")).body;
    for (const text of [
      "Delete account", "the word <strong>DELETE</strong>", "cannot be undone", "within 30 days",
      "Deleted user", "Kept, without your name", "joined earliest", "nobody else ever joined",
    ]) expect(body).toContain(text);
    expect(body).toContain('id="what-happens"');
  });

  it("the privacy policy covers the headings the stores look for, and points to the deletion page", async () => {
    const body = (await get(await appWith({ supportEmail: "help@example.com" }), "/privacy")).body;
    for (const id of ["what-we-keep", "why", "who", "where", "how-long", "choices", "not-a-user", "security", "children", "changes", "contact"]) {
      expect(body).toContain(`id="${id}"`);
    }
    expect(body).toContain('href="/delete-account#what-happens"');
    expect(body).toContain(`Last updated ${POLICY_UPDATED}`);
  });

  it("does not claim what the app does not do", async () => {
    const body = (await get(await appWith({ supportEmail: "help@example.com" }), "/privacy")).body;
    // There is no automatic purge of proofs and no download button for personal data yet.
    expect(body).not.toMatch(/30 days after/i);
    expect(body).not.toMatch(/automatically (delete|remove|purge)/i);
    expect(body).toContain("The app has no download button for your data yet");
  });
});

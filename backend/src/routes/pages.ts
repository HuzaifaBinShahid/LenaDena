import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config.js";
import { deleteAccountPage } from "../pages/deleteAccount.js";
import { contactFrom } from "../pages/layout.js";
import { privacyPage } from "../pages/privacy.js";

/**
 * Public pages the app stores ask for: GET /privacy and GET /delete-account. No sign-in, no script, not listed in the
 * API documentation. They are built once at startup, since they only change with the code and two settings.
 */
export const pageRoutes: FastifyPluginAsync<{ config: Pick<AppConfig, "supportEmail" | "operatorName"> }> = async (fastify, { config }) => {
  const contact = contactFrom(config);
  const pages: Record<string, string> = {
    "/privacy": privacyPage(contact),
    "/delete-account": deleteAccountPage(contact),
  };
  for (const [path, html] of Object.entries(pages)) {
    fastify.get(path, { schema: { hide: true } }, async (_request, reply) =>
      reply
        .type("text/html; charset=utf-8")
        // Five minutes: long enough to spare the function, short enough that a changed contact address shows soon.
        .header("Cache-Control", "public, max-age=300")
        .send(html));
  }
};

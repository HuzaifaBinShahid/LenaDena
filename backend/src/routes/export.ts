import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { buildCsv, EXPORT_MAX_BYTES, exportContentType, exportFileName, exportTooLarge } from "../domain/export.js";
import { ErrorSchema, ExportQuerySchema } from "../http/schemas.js";

/**
 * Settings -> Export my data: GET /v1/me/export?format=json|csv. The person's own records only (the database function
 * decides what that means), as a file download. Not cached, and rate limited because it reads a lot.
 */
export const exportRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get("/me/export", {
    config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    schema: {
      tags: ["profile"],
      security: [{ bearerAuth: [] }],
      querystring: ExportQuerySchema,
      // The 200 body is a file (a string, sent as it is: Fastify does not JSON-quote a string payload).
      response: { 200: Type.String(), 400: ErrorSchema, 401: ErrorSchema, 404: ErrorSchema, 413: ErrorSchema, 429: ErrorSchema, 503: ErrorSchema },
    },
  }, async (request, reply) => {
    const format = request.query.format ?? "json";
    const document = await fastify.ledger.exportData(request.authUser.id);
    const body = format === "csv" ? buildCsv(document) : JSON.stringify(document, null, 2);
    if (Buffer.byteLength(body) > EXPORT_MAX_BYTES) throw exportTooLarge();
    return reply
      .type(exportContentType(format))
      .header("content-disposition", `attachment; filename="${exportFileName(format, new Date())}"`)
      .header("cache-control", "no-store")
      .send(body);
  });
};

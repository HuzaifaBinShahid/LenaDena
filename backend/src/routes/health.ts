import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";

export const healthRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get("/health", {
    schema: {
      tags: ["system"],
      response: {
        200: Type.Object({ status: Type.Literal("ok"), version: Type.String(), timestamp: Type.String() }),
      },
    },
  }, async () => ({ status: "ok" as const, version: "0.1.0", timestamp: new Date().toISOString() }));
};

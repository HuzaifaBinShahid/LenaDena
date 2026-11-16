import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import Fastify, { LogController } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { LedgerRepository } from "./repositories/LedgerRepository.js";
import type { AppConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { DomainError } from "./domain/errors.js";
import { authPlugin } from "./plugins/auth.js";
import { repositoryPlugin } from "./plugins/repository.js";
import { accountRoutes } from "./routes/account.js";
import { healthRoutes } from "./routes/health.js";
import { notificationRoutes } from "./routes/notifications.js";
import type { NotificationRunner } from "./notifications/runner.js";
import { ledgerRoutes } from "./routes/ledger.js";
import { peopleRoutes } from "./routes/people.js";
import { voiceRoutes } from "./routes/voice.js";
import type { VoiceTranscriber } from "./voice/DeepgramTranscriber.js";

type BuildOptions = {
  config?: Partial<AppConfig>;
  repository?: LedgerRepository;
  voiceTranscriber?: VoiceTranscriber;
  /** Tests pass a stand-in for the hosted email worker pass. */
  notificationRunner?: NotificationRunner;
};

export async function buildApp(options: BuildOptions = {}) {
  const config = loadConfig(options.config);
  const app = Fastify({
    logger: config.nodeEnv === "test" ? false : { level: config.nodeEnv === "production" ? "info" : "debug", redact: ["req.headers.authorization", "req.headers.cookie"] },
    bodyLimit: 1024 * 1024,
    genReqId: () => randomUUID(),
    logController: new LogController({ disableRequestLogging: (request) => request.url === "/health" }),
  });

  await app.register(sensible);
  await app.register(helmet, { contentSecurityPolicy: config.nodeEnv === "production" });
  await app.register(multipart, { limits: { files: 1, fileSize: 5 * 1024 * 1024, fields: 0, parts: 1 } });
  // @fastify/cors only allows GET, HEAD and POST by default, which makes browsers refuse every PATCH and DELETE
  // (editing or removing a person from the web build). Native apps are not subject to CORS.
  await app.register(cors, {
    origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map((origin) => origin.trim()),
    credentials: config.corsOrigin !== "*",
    methods: ["GET", "HEAD", "POST", "PATCH", "DELETE"],
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute", keyGenerator: (request) => request.authUser?.id ?? request.ip });
  await app.register(swagger, {
    openapi: {
      info: { title: "LenaDena API", version: "0.1.0", description: "Verified friend-group expense ledger" },
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
    },
  });
  if (config.nodeEnv !== "production") {
    await app.register(swaggerUi, { routePrefix: "/documentation" });
  }
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      return reply.code(error.statusCode).send({ statusCode: error.statusCode, code: error.code, message: error.message, requestId: request.id });
    }
    if ((error as { validation?: unknown }).validation) {
      return reply.code(400).send({ statusCode: 400, code: "validation_error", message: "The request did not match the API contract", requestId: request.id });
    }
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ statusCode, code: (error as { code?: string }).code ?? "request_error", message: error instanceof Error ? error.message : "Request failed", requestId: request.id });
    }
    request.log.error({ err: error }, "request failed");
    return reply.code(500).send({ statusCode: 500, code: "internal_error", message: "An unexpected error occurred", requestId: request.id });
  });

  await app.register(repositoryPlugin, options.repository ? { config, repository: options.repository } : { config });
  await app.register(authPlugin, config);
  await app.register(healthRoutes);
  await app.register(notificationRoutes, { config, ...(options.notificationRunner ? { runner: options.notificationRunner } : {}) });
  await app.register(ledgerRoutes, { prefix: "/v1" });
  await app.register(accountRoutes, { prefix: "/v1", config });
  await app.register(peopleRoutes, { prefix: "/v1", config });
  await app.register(voiceRoutes, { prefix: "/v1", config, ...(options.voiceTranscriber ? { transcriber: options.voiceTranscriber } : {}) });

  return { app, config };
}

/**
 * Vercel detects this module as the Fastify entry point.  Its Node runtime
 * invokes a default request handler, whereas local development starts the
 * server from `server.ts`.  Cache the initialized Fastify instance so module
 * reuse on a warm serverless function does not recreate plugins or clients.
 */
let vercelApp: Promise<Awaited<ReturnType<typeof buildApp>>> | undefined;

export default async function vercelHandler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  vercelApp ??= buildApp();
  const { app } = await vercelApp;
  await app.ready();
  app.server.emit("request", request, response);
}

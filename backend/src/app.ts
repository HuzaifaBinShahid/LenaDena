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
import { exportRoutes } from "./routes/export.js";
import { groupRoutes } from "./routes/groups.js";
import { notificationRoutes } from "./routes/notifications.js";
import { pushRoutes } from "./routes/push.js";
import { pageRoutes } from "./routes/pages.js";
import type { NotificationRunner } from "./notifications/runner.js";
import { FcmPushSender, type FcmFetcher, type PushSender } from "./push/fcm.js";
import { googleCallName, traced } from "./observability/upstream.js";
import { timingPlugin } from "./plugins/timing.js";
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
  /** Tests pass a stand-in for Firebase Cloud Messaging; otherwise one is made from FIREBASE_SERVICE_ACCOUNT_JSON, if set. */
  pushSender?: PushSender;
  /** Tests set 0 to skip the invitation's fixed minimum duration (see routes/groups.ts). */
  inviteFloorMs?: number;
};

export async function buildApp(options: BuildOptions = {}) {
  const config = loadConfig(options.config);
  const app = Fastify({
    logger: config.nodeEnv === "test" ? false : { level: config.nodeEnv === "production" ? "info" : "debug", redact: ["req.headers.authorization", "req.headers.cookie"] },
    bodyLimit: 1024 * 1024,
    genReqId: () => randomUUID(),
    // plugins/timing.ts writes one line per request (route, status, time, time spent on other services) instead.
    logController: new LogController({ disableRequestLogging: () => true }),
  });

  // First, so that the calls made by the hooks registered after it (rate limiting, authentication) are timed too.
  await app.register(timingPlugin, { slowMs: config.slowRequestMs });
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
  // Calls to Firebase are timed like the calls to Supabase (observability/upstream.ts).
  const pushSender = options.pushSender ?? (config.firebase ? new FcmPushSender(config.firebase, { fetcher: traced(fetch as unknown as FcmFetcher, googleCallName) }) : undefined);
  if (config.nodeEnv === "production" && config.firebaseInvalid) {
    app.log.warn("FIREBASE_SERVICE_ACCOUNT_JSON is set but is not a usable service account key: push notifications stay off");
  }
  await app.register(healthRoutes, { config, pushOn: Boolean(pushSender) });
  await app.register(pageRoutes, { config });
  if (config.nodeEnv === "production" && !config.supportEmail) {
    app.log.warn("SUPPORT_EMAIL is not set (or is not an email address): the privacy and account deletion pages show no contact address");
  }
  await app.register(notificationRoutes, { config, ...(options.notificationRunner ? { runner: options.notificationRunner } : {}) });
  await app.register(ledgerRoutes, { prefix: "/v1", ...(pushSender ? { pushSender } : {}) });
  await app.register(accountRoutes, { prefix: "/v1", config });
  await app.register(exportRoutes, { prefix: "/v1" });
  await app.register(groupRoutes, { prefix: "/v1", ...(pushSender ? { pushSender } : {}), ...(options.inviteFloorMs !== undefined ? { inviteFloorMs: options.inviteFloorMs } : {}) });
  await app.register(pushRoutes, { prefix: "/v1", ...(pushSender ? { sender: pushSender } : {}) });
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

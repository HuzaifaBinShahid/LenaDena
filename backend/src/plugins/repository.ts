import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { createClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config.js";
import type { LedgerRepository } from "../repositories/LedgerRepository.js";
import { MemoryLedgerRepository } from "../repositories/MemoryLedgerRepository.js";
import { SupabaseLedgerRepository } from "../repositories/SupabaseLedgerRepository.js";

type RepositoryOptions = {
  config: AppConfig;
  repository?: LedgerRepository;
};

export const repositoryPlugin = fp(async function repositoryPlugin(fastify, options: RepositoryOptions) {
  if (options.repository) {
    fastify.decorate("ledger", options.repository);
    return;
  }
  if (options.config.authMode === "supabase" && options.config.supabaseUrl && options.config.supabaseSecretKey) {
    const client = createClient(options.config.supabaseUrl, options.config.supabaseSecretKey, { auth: { autoRefreshToken: false, persistSession: false } });
    fastify.decorate("ledger", new SupabaseLedgerRepository(client, fastify.log));
    return;
  }
  fastify.decorate("ledger", new MemoryLedgerRepository());
} as FastifyPluginAsync<RepositoryOptions>);

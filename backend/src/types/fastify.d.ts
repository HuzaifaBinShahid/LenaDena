import "fastify";
import type { LedgerRepository } from "../repositories/LedgerRepository.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser: {
      id: string;
      email?: string;
    };
  }

  interface FastifyInstance {
    ledger: LedgerRepository;
  }
}

import "fastify";
import type { LedgerRepository } from "../repositories/LedgerRepository.js";

declare module "fastify" {
  interface FastifyRequest {
    authUser: {
      id: string;
      email?: string;
      /**
       * Unix seconds of the last time this session was opened with a password, read from the verified token's `amr`
       * claim. It survives token refreshes, so it says when the password was typed, not when the token was issued.
       */
      passwordSignInAt?: number;
    };
  }

  interface FastifyInstance {
    ledger: LedgerRepository;
  }
}

import type { FastifyBaseLogger } from "fastify";
import type { PaymentPushEvent } from "../domain/push.js";
import type { LedgerRepository } from "../repositories/LedgerRepository.js";
import type { PushSender } from "./fcm.js";
import { paymentMessage } from "./messages.js";
import { within } from "./within.js";

type PaymentPushInput = {
  ledger: LedgerRepository;
  /** Unset when the server has no Firebase credentials: nothing is sent and nothing is asked of the database. */
  sender: PushSender | undefined;
  log: FastifyBaseLogger;
  /** The person who just took the step (claimed, confirmed, flagged or self-settled a payment). */
  userId: string;
  settlementId: string;
  event: PaymentPushEvent;
  /** How long the payment request may wait for Firebase before answering without it. */
  timeoutMs?: number;
};

/**
 * Tells the other person about a payment step, best effort. It never throws and never changes what the caller answers:
 * the payment is already saved, and a missing notification costs the other person nothing the activity list, the
 * email and the Reviews tab do not also show. The request waits for Firebase (at most `timeoutMs`) rather than
 * sending after the answer, because a serverless function can be frozen the moment it has answered.
 *
 * The database decides whether to send at all (app_get_payment_push_target): only for a step that just happened and
 * was the caller's, only to a person with a registered phone, once per step, and not when someone claims payments in
 * a flood.
 */
export async function sendPaymentPush({ ledger, sender, log, userId, settlementId, event, timeoutMs = 3000 }: PaymentPushInput): Promise<void> {
  if (!sender) return;
  try {
    const target = await ledger.getPaymentPushTarget(userId, settlementId, event);
    if (!target || target.tokens.length === 0) return;
    const result = await within(sender.send(target.tokens, paymentMessage(target)), timeoutMs);
    if (result?.invalidTokens.length) await ledger.dropPushTokens(result.invalidTokens);
    if (!result) log.warn({ event }, "payment push: Firebase did not answer in time");
    else if (result.delivered === 0 && result.failed > 0) log.warn({ event, failed: result.failed }, "payment push: could not be delivered");
  } catch (error) {
    log.warn({ err: error instanceof Error ? error.message : "unknown", event }, "payment push failed");
  }
}

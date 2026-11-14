import { loadNotificationConfig } from "./notifications/config.js";
import { createNotificationRunner } from "./notifications/runner.js";

/**
 * The long-lived email worker: one pass every NOTIFICATION_INTERVAL_MS. It is the same code the hosted API runs on a
 * schedule (`POST /internal/notifications/run`); use this loop when you have a machine that stays on.
 */
const config = loadNotificationConfig();
const runner = createNotificationRunner(config);

async function main() {
  for (;;) {
    try {
      await runner.runBatch();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      process.stderr.write(`${message}\n`);
    }
    await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
  }
}

void main();

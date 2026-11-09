// Wording for the per-person email settings. Pure (Vitest runs it): no react-native.
import type { ReminderFrequency } from "../ledger/types";

/** What the reminder choice means, in the settings row's own words. */
export function reminderDetail(first: string, frequency: ReminderFrequency, address: string | undefined): string {
  if (!address) return "Add their email in Edit to turn reminders on.";
  if (frequency === "weekly") return `${first} gets a weekly email of what's still open. Nothing is sent when nothing is open.`;
  if (frequency === "monthly") return `${first} gets a monthly email of what's still open. Nothing is sent when nothing is open.`;
  return `Email ${first} what's still open, every week or every month.`;
}

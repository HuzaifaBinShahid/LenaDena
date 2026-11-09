import { describe, expect, it } from "vitest";
import { reminderDetail } from "./emailSettings";

describe("reminderDetail", () => {
  it("asks for an email before reminders can be turned on", () => {
    expect(reminderDetail("Ali", "off", undefined)).toBe("Add their email in Edit to turn reminders on.");
    expect(reminderDetail("Ali", "weekly", undefined)).toBe("Add their email in Edit to turn reminders on.");
  });

  it("says how often they are reminded, and that nothing goes out when nothing is open", () => {
    expect(reminderDetail("Ali", "weekly", "ali@example.com")).toBe("Ali gets a weekly email of what's still open. Nothing is sent when nothing is open.");
    expect(reminderDetail("Ali", "monthly", "ali@example.com")).toBe("Ali gets a monthly email of what's still open. Nothing is sent when nothing is open.");
  });

  it("explains the option while it is off", () => {
    expect(reminderDetail("Ali", "off", "ali@example.com")).toBe("Email Ali what's still open, every week or every month.");
  });
});

import { describe, expect, it } from "vitest";
import { dateFromIso, dateToIso, formatLongDate } from "./format";

describe("date formatting", () => {
  it("shows event dates in day month year order", () => {
    expect(formatLongDate("2026-09-13")).toMatch(/^13 \S+ 2026$/);
  });

  it("round-trips local calendar dates without a timezone shift", () => {
    expect(dateToIso(dateFromIso("2026-09-13"))).toBe("2026-09-13");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  MINUS,
  addDaysIso,
  dateFromIso,
  dateToIso,
  firstName,
  formatDayMonth,
  formatDayRange,
  formatLongDate,
  formatMoney,
  formatMonth,
  formatSignedMoney,
  formatWeekday,
  isoDayDiff,
  lastDayOfMonth,
  relativeDayLabel,
  shiftMonth,
} from "./format";

const originalTz = process.env.TZ;

function withTimeZone(timeZone: string, run: () => void) {
  process.env.TZ = timeZone;
  try {
    run();
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }
}

function shortMonth(year: number, monthIndex: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(year, monthIndex, 1, 12));
}

describe("date formatting", () => {
  it("shows event dates in day month year order", () => {
    expect(formatLongDate("2026-09-13")).toMatch(/^13 \S+ 2026$/);
  });

  it("round-trips local calendar dates without a timezone shift", () => {
    expect(dateToIso(dateFromIso("2026-09-13"))).toBe("2026-09-13");
  });
});

describe("MINUS and formatSignedMoney", () => {
  it("is the U+2212 minus sign", () => {
    expect(MINUS).toBe("−");
    expect(MINUS.codePointAt(0)).toBe(0x2212);
  });

  it("renders a real minus sign, never a hyphen", () => {
    const text = formatSignedMoney(425000, "PKR", "-");
    expect(text).toBe(`−${formatMoney(425000, "PKR")}`);
    expect(text.startsWith("-")).toBe(false);
    expect(text).not.toContain("-");
  });

  it("renders plus and unsigned amounts", () => {
    expect(formatSignedMoney(110000, "PKR", "+")).toBe(`+${formatMoney(110000, "PKR")}`);
    expect(formatSignedMoney(110000, "PKR", "none")).toBe(formatMoney(110000, "PKR"));
  });

  it("treats the amount as a magnitude and never prints NaN", () => {
    expect(formatSignedMoney(-2500, "PKR", "-")).toBe(`−${formatMoney(2500, "PKR")}`);
    expect(formatSignedMoney(Number.NaN, "PKR", "+")).toBe(`+${formatMoney(0, "PKR")}`);
    expect(formatSignedMoney(0, "USD", "none")).not.toContain("NaN");
  });
});

describe("firstName", () => {
  it("takes the first word of a trimmed name", () => {
    expect(firstName("  Huzaifa Bin Shahid ")).toBe("Huzaifa");
    expect(firstName("Sara")).toBe("Sara");
    expect(firstName("Ali\tKhan")).toBe("Ali");
  });

  it("returns an empty string for blank names", () => {
    expect(firstName("")).toBe("");
    expect(firstName("   ")).toBe("");
  });
});

describe("addDaysIso", () => {
  it("crosses month and year ends", () => {
    expect(addDaysIso("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysIso("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDaysIso("2027-01-02", -3)).toBe("2026-12-30");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysIso("2026-09-14", -29)).toBe("2026-08-16");
    expect(addDaysIso("2026-09-14", 0)).toBe("2026-09-14");
  });

  it("is DST-safe in zones that change clocks", () => {
    withTimeZone("America/New_York", () => {
      expect(new Date(2026, 0, 15, 12).getTimezoneOffset()).toBe(300);
      expect(new Date(2026, 6, 15, 12).getTimezoneOffset()).toBe(240);
    });
    for (const zone of ["America/New_York", "Europe/London", "Australia/Sydney", "America/Santiago"]) {
      withTimeZone(zone, () => {
        expect(addDaysIso("2026-03-07", 1)).toBe("2026-03-08");
        expect(addDaysIso("2026-03-08", 1)).toBe("2026-03-09");
        expect(addDaysIso("2026-03-28", 2)).toBe("2026-03-30");
        expect(addDaysIso("2026-04-04", 1)).toBe("2026-04-05");
        expect(addDaysIso("2026-10-03", 2)).toBe("2026-10-05");
        expect(addDaysIso("2026-11-02", -1)).toBe("2026-11-01");
        expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
        expect(addDaysIso("2026-03-30", -30)).toBe("2026-02-28");
        let cursor = "2026-01-01";
        for (let step = 0; step < 365; step += 1) cursor = addDaysIso(cursor, 1);
        expect(cursor).toBe("2027-01-01");
      });
    }
  });

  it("returns the input when it is not a date", () => {
    expect(addDaysIso("not-a-date", 3)).toBe("not-a-date");
  });
});

describe("isoDayDiff", () => {
  it("counts whole calendar days", () => {
    expect(isoDayDiff("2026-09-13", "2026-09-14")).toBe(1);
    expect(isoDayDiff("2026-09-14", "2026-09-13")).toBe(-1);
    expect(isoDayDiff("2026-12-25", "2027-01-01")).toBe(7);
    expect(isoDayDiff("2026-09-14", "2026-09-14")).toBe(0);
  });

  it("is DST-safe", () => {
    withTimeZone("America/New_York", () => {
      expect(isoDayDiff("2026-03-07", "2026-03-09")).toBe(2);
      expect(isoDayDiff("2026-10-31", "2026-11-02")).toBe(2);
    });
  });

  it("gives 0 for invalid input", () => {
    expect(isoDayDiff("nope", "2026-09-14")).toBe(0);
  });
});

describe("shiftMonth and lastDayOfMonth", () => {
  it("shifts back eleven months across a year", () => {
    expect(shiftMonth("2026-09", -11)).toBe("2025-10");
    expect(shiftMonth("2026-01", -11)).toBe("2025-02");
    expect(shiftMonth("2026-11", -11)).toBe("2025-12");
    expect(shiftMonth("2026-12", -11)).toBe("2026-01");
  });

  it("shifts forward, by zero, and accepts full ISO dates", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-09", 0)).toBe("2026-09");
    expect(shiftMonth("2026-09", -24)).toBe("2024-09");
    expect(shiftMonth("2026-09-14", -1)).toBe("2026-08");
    expect(shiftMonth("bad", 2)).toBe("bad");
  });

  it("knows month lengths, including leap years", () => {
    expect(lastDayOfMonth("2026-02")).toBe(28);
    expect(lastDayOfMonth("2028-02")).toBe(29);
    expect(lastDayOfMonth("2026-09")).toBe(30);
    expect(lastDayOfMonth("2026-12")).toBe(31);
    expect(lastDayOfMonth("bad")).toBe(0);
  });
});

describe("weekday and month labels", () => {
  it("formats weekdays with the device locale", () => {
    expect(formatWeekday("2026-09-14", "short")).toBe(new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(2026, 8, 14, 12)));
    expect(formatWeekday("2026-09-14", "long")).toBe(new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date(2026, 8, 14, 12)));
    expect(formatWeekday("2026-09-14", "short")).not.toBe(formatWeekday("2026-09-15", "short"));
  });

  it("formats months with and without a year", () => {
    const september = new Date(2026, 8, 1, 12);
    expect(formatMonth("2026-09", "short")).toBe(new Intl.DateTimeFormat(undefined, { month: "short" }).format(september));
    expect(formatMonth("2026-09", "long")).toBe(new Intl.DateTimeFormat(undefined, { month: "long" }).format(september));
    expect(formatMonth("2026-09", "narrow")).toBe(new Intl.DateTimeFormat(undefined, { month: "narrow" }).format(september));
    expect(formatMonth("2026-09", "long", true)).toContain("2026");
    expect(formatMonth("2026-09", "short")).not.toContain("2026");
    expect(formatMonth("2026-01-31", "short")).toBe(shortMonth(2026, 0));
  });
});

describe("formatDayMonth and formatDayRange", () => {
  it("puts the day first", () => {
    expect(formatDayMonth("2026-09-09")).toBe(`9 ${shortMonth(2026, 8)}`);
  });

  it("collapses a range inside one month", () => {
    expect(formatDayRange("2026-09-09", "2026-09-14")).toBe(`9–14 ${shortMonth(2026, 8)}`);
  });

  it("names both months when a range crosses a month or year", () => {
    expect(formatDayRange("2026-08-28", "2026-09-02")).toBe(`28 ${shortMonth(2026, 7)}–2 ${shortMonth(2026, 8)}`);
    expect(formatDayRange("2026-12-29", "2027-01-03")).toBe(`29 ${shortMonth(2026, 11)}–3 ${shortMonth(2027, 0)}`);
  });

  it("handles a single day and same-month ranges in different years", () => {
    expect(formatDayRange("2026-09-14", "2026-09-14")).toBe(formatDayMonth("2026-09-14"));
    expect(formatDayRange("2025-09-09", "2026-09-14")).toBe(`9 ${shortMonth(2025, 8)} 2025–14 ${shortMonth(2026, 8)} 2026`);
  });
});

describe("relativeDayLabel", () => {
  const today = "2026-09-14";

  it("names today and yesterday", () => {
    expect(relativeDayLabel("2026-09-14", today)).toBe("Today");
    expect(relativeDayLabel("2026-09-13", today)).toBe("Yesterday");
    expect(relativeDayLabel("2027-01-01", "2027-01-02")).toBe("Yesterday");
  });

  it("marks tomorrow and later as upcoming with the long date", () => {
    expect(relativeDayLabel("2026-09-15", today)).toBe(`Upcoming · ${formatLongDate("2026-09-15")}`);
    expect(relativeDayLabel("2026-09-15", today)).toMatch(/^Upcoming · 15 \S+ 2026$/);
    expect(relativeDayLabel("2026-09-20", today)).toBe(`Upcoming · ${formatLongDate("2026-09-20")}`);
  });

  it("uses the long date for older days", () => {
    expect(relativeDayLabel("2026-09-12", today)).toBe(formatLongDate("2026-09-12"));
  });
});

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

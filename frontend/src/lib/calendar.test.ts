import { afterEach, describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addMonthsToDate,
  canShiftMonth,
  clampDay,
  clampMonth,
  compareDays,
  compareMonths,
  dayAccessibilityLabel,
  daysInMonth,
  formatHeaderDate,
  formatMonthTitle,
  formatSpokenDate,
  isDayDisabled,
  isLeapYear,
  isMonthDisabled,
  isSameDay,
  isYearDisabled,
  localDay,
  monthLabels,
  monthMatrix,
  quickDates,
  toLocalDay,
  weekdayColumn,
  weekdayLabels,
} from "./calendar";
import { dateFromIso, dateToIso } from "./format";

const originalTz = process.env.TZ;

function inTimeZone(timeZone: string, run: () => void) {
  process.env.TZ = timeZone;
  try {
    run();
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }
}

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const iso = (date: Date) => dateToIso(date);

describe("days", () => {
  it("builds local-noon days and rolls over like Date", () => {
    const day = localDay(2026, 9, 3);
    expect(day.getHours()).toBe(12);
    expect(iso(day)).toBe("2026-10-03");
    expect(iso(localDay(2026, 11, 32))).toBe("2027-01-01");
    expect(iso(localDay(2026, 0, 0))).toBe("2025-12-31");
  });

  it("normalises any time of day to noon of the same calendar day", () => {
    expect(iso(toLocalDay(new Date(2026, 2, 29, 0, 5)))).toBe("2026-03-29");
    expect(iso(toLocalDay(new Date(2026, 2, 29, 23, 59)))).toBe("2026-03-29");
    expect(toLocalDay(new Date(2026, 2, 29, 23, 59)).getHours()).toBe(12);
  });

  it("compares calendar days and ignores the time", () => {
    expect(compareDays(new Date(2026, 4, 1, 0, 1), new Date(2026, 4, 1, 23, 59))).toBe(0);
    expect(compareDays(localDay(2026, 4, 1), localDay(2026, 4, 2))).toBe(-1);
    expect(compareDays(localDay(2027, 0, 1), localDay(2026, 11, 31))).toBe(1);
    expect(isSameDay(localDay(2026, 4, 1), new Date(2026, 4, 1, 8))).toBe(true);
    expect(isSameDay(localDay(2026, 4, 1), null)).toBe(false);
    expect(isSameDay(new Date("nope"), localDay(2026, 4, 1))).toBe(false);
  });

  it("adds days across month and year boundaries", () => {
    expect(iso(addDays(localDay(2026, 0, 31), 1))).toBe("2026-02-01");
    expect(iso(addDays(localDay(2026, 11, 31), 1))).toBe("2027-01-01");
    expect(iso(addDays(localDay(2024, 1, 28), 1))).toBe("2024-02-29");
    expect(iso(addDays(localDay(2026, 2, 1), -1))).toBe("2026-02-28");
  });
});

describe("months", () => {
  it("knows month lengths and leap years", () => {
    expect(daysInMonth(2026, 0)).toBe(31);
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2000, 1)).toBe(29);
    expect(daysInMonth(1900, 1)).toBe(28);
    expect(daysInMonth(2026, 3)).toBe(30);
    expect(daysInMonth(2026, 11)).toBe(31);
    expect([isLeapYear(2024), isLeapYear(2026), isLeapYear(2000), isLeapYear(2100)]).toEqual([true, false, true, false]);
  });

  it("shifts months both ways across years", () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(addMonths({ year: 2026, month: 5 }, -18)).toEqual({ year: 2024, month: 11 });
    expect(addMonths({ year: 2026, month: 5 }, 30)).toEqual({ year: 2028, month: 11 });
    expect(compareMonths({ year: 2026, month: 1 }, { year: 2025, month: 11 })).toBe(1);
    expect(compareMonths({ year: 2026, month: 1 }, { year: 2026, month: 1 })).toBe(0);
  });

  it("keeps the day when adding months and clamps to shorter months", () => {
    expect(iso(addMonthsToDate(localDay(2026, 0, 31), 1))).toBe("2026-02-28");
    expect(iso(addMonthsToDate(localDay(2024, 0, 31), 1))).toBe("2024-02-29");
    expect(iso(addMonthsToDate(localDay(2026, 2, 31), -1))).toBe("2026-02-28");
    expect(iso(addMonthsToDate(localDay(2026, 9, 3), 3))).toBe("2027-01-03");
  });
});

describe("monthMatrix", () => {
  it("always returns six Monday-first weeks", () => {
    const rows = monthMatrix({ year: 2026, month: 9 });
    expect(rows).toHaveLength(6);
    rows.forEach((row) => {
      expect(row).toHaveLength(7);
      expect(row[0]!.date.getDay()).toBe(1);
    });
  });

  it("places the 1st under its weekday and pads with neighbouring months", () => {
    // 1 October 2026 is a Thursday: three September days lead the grid.
    const cells = monthMatrix({ year: 2026, month: 9 }).flat();
    expect(iso(cells[0]!.date)).toBe("2026-09-28");
    expect(cells[0]!.inMonth).toBe(false);
    expect(iso(cells[3]!.date)).toBe("2026-10-01");
    expect(cells[3]!.inMonth).toBe(true);
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31);
    expect(iso(cells[41]!.date)).toBe("2026-11-08");
  });

  it("starts on the 1st when the month begins on a Monday", () => {
    // 1 June 2026 is a Monday.
    const cells = monthMatrix({ year: 2026, month: 5 }).flat();
    expect(iso(cells[0]!.date)).toBe("2026-06-01");
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(30);
  });

  it("puts a Sunday 1st in the last column", () => {
    // 1 March 2026 is a Sunday.
    const cells = monthMatrix({ year: 2026, month: 2 }).flat();
    expect(iso(cells[6]!.date)).toBe("2026-03-01");
    expect(weekdayColumn(localDay(2026, 2, 1))).toBe(6);
  });

  it("handles leap-year February", () => {
    const cells = monthMatrix({ year: 2024, month: 1 }).flat();
    const inMonth = cells.filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(29);
    expect(iso(inMonth[28]!.date)).toBe("2024-02-29");
  });

  it("supports a Sunday-first week", () => {
    const rows = monthMatrix({ year: 2026, month: 9 }, 0);
    expect(rows[0]![0]!.date.getDay()).toBe(0);
    expect(iso(rows[0]![4]!.date)).toBe("2026-10-01");
  });

  it("never repeats or skips a day across DST changes", () => {
    for (const timeZone of ["Europe/London", "America/New_York", "America/Sao_Paulo", "Australia/Lord_Howe", "Asia/Karachi"]) {
      inTimeZone(timeZone, () => {
        for (const value of [{ year: 2026, month: 2 }, { year: 2026, month: 9 }, { year: 2026, month: 10 }, { year: 2026, month: 3 }]) {
          const cells = monthMatrix(value).flat();
          cells.forEach((cell, index) => {
            expect(cell.date.getHours()).toBe(12);
            if (index > 0) expect(compareDays(cells[index - 1]!.date, cell.date)).toBe(-1);
            if (index > 0) expect(iso(addDays(cells[index - 1]!.date, 1))).toBe(iso(cell.date));
          });
        }
      });
    }
  });
});

describe("round trips with the stored YYYY-MM-DD strings", () => {
  it("keeps the same day through dateFromIso and dateToIso in far-off time zones", () => {
    for (const timeZone of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "Europe/London", "America/Sao_Paulo"]) {
      inTimeZone(timeZone, () => {
        for (const value of ["2026-03-29", "2026-10-25", "2026-11-01", "2024-02-29", "2026-12-31", "2027-01-01"]) {
          const date = dateFromIso(value);
          expect(iso(toLocalDay(date))).toBe(value);
          const cells = monthMatrix({ year: date.getFullYear(), month: date.getMonth() }).flat();
          expect(cells.some((cell) => cell.inMonth && isSameDay(cell.date, date))).toBe(true);
        }
      });
    }
  });
});

describe("bounds", () => {
  const bounds = { minimumDate: localDay(2026, 8, 10), maximumDate: new Date(2026, 10, 5, 23, 30) };

  it("disables days outside the inclusive bounds by calendar day", () => {
    expect(isDayDisabled(localDay(2026, 8, 9), bounds)).toBe(true);
    expect(isDayDisabled(new Date(2026, 8, 10, 0, 1), bounds)).toBe(false);
    expect(isDayDisabled(localDay(2026, 10, 5), bounds)).toBe(false);
    expect(isDayDisabled(localDay(2026, 10, 6), bounds)).toBe(true);
    expect(isDayDisabled(localDay(1990, 0, 1), {})).toBe(false);
  });

  it("clamps days into range at local noon", () => {
    expect(iso(clampDay(localDay(2026, 0, 1), bounds))).toBe("2026-09-10");
    expect(iso(clampDay(localDay(2027, 0, 1), bounds))).toBe("2026-11-05");
    expect(clampDay(localDay(2027, 0, 1), bounds).getHours()).toBe(12);
    expect(iso(clampDay(localDay(2026, 9, 3), bounds))).toBe("2026-10-03");
    expect(iso(clampDay(new Date("bad"), {}, localDay(2026, 4, 4)))).toBe("2026-05-04");
  });

  it("disables and clamps whole months", () => {
    expect(isMonthDisabled({ year: 2026, month: 7 }, bounds)).toBe(true);
    expect(isMonthDisabled({ year: 2026, month: 8 }, bounds)).toBe(false);
    expect(isMonthDisabled({ year: 2026, month: 10 }, bounds)).toBe(false);
    expect(isMonthDisabled({ year: 2026, month: 11 }, bounds)).toBe(true);
    expect(clampMonth({ year: 2020, month: 0 }, bounds)).toEqual({ year: 2026, month: 8 });
    expect(clampMonth({ year: 2030, month: 0 }, bounds)).toEqual({ year: 2026, month: 10 });
    expect(canShiftMonth({ year: 2026, month: 8 }, -1, bounds)).toBe(false);
    expect(canShiftMonth({ year: 2026, month: 8 }, 1, bounds)).toBe(true);
    expect(canShiftMonth({ year: 2026, month: 10 }, 1, bounds)).toBe(false);
    expect(canShiftMonth({ year: 2026, month: 10 }, 1, {})).toBe(true);
  });

  it("disables years without an allowed day", () => {
    expect(isYearDisabled(2025, bounds)).toBe(true);
    expect(isYearDisabled(2026, bounds)).toBe(false);
    expect(isYearDisabled(2027, bounds)).toBe(true);
    expect(isYearDisabled(1800, {})).toBe(false);
  });

  it("offers quick dates only inside the bounds", () => {
    const today = new Date(2026, 8, 18, 22, 45);
    expect(quickDates(today, {}).map((item) => [item.key, iso(item.date)])).toEqual([
      ["yesterday", "2026-09-17"],
      ["today", "2026-09-18"],
      ["tomorrow", "2026-09-19"],
    ]);
    expect(quickDates(today, { minimumDate: localDay(2026, 8, 18) }).map((item) => item.key)).toEqual(["today", "tomorrow"]);
    expect(quickDates(today, { maximumDate: new Date(2026, 8, 18, 1) }).map((item) => item.key)).toEqual(["yesterday", "today"]);
    expect(quickDates(today, { minimumDate: localDay(2027, 0, 1) })).toEqual([]);
  });

  it("gives quick dates across month ends", () => {
    const [yesterday, , tomorrow] = quickDates(localDay(2026, 2, 1), {});
    expect(iso(yesterday!.date)).toBe("2026-02-28");
    expect(iso(tomorrow!.date)).toBe("2026-03-02");
  });
});

describe("labels", () => {
  it("lists weekdays Monday first", () => {
    expect(weekdayLabels("short", "en-GB")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(weekdayLabels("long", "en-GB")[6]).toBe("Sunday");
    expect(weekdayLabels("short", "en-GB", 0)[0]).toBe("Sun");
  });

  it("lists months", () => {
    expect(monthLabels("short", "en-GB")).toHaveLength(12);
    expect(monthLabels("long", "en-GB")[0]).toBe("January");
    expect(monthLabels("short", "en-GB")[9]).toBe("Oct");
  });

  it("formats the month title, header and spoken date", () => {
    expect(formatMonthTitle({ year: 2026, month: 9 }, "en-GB")).toBe("October 2026");
    expect(formatHeaderDate(localDay(2026, 9, 3), "en-GB")).toEqual({ year: "2026", label: "Sat, 3 Oct" });
    expect(formatSpokenDate(localDay(2026, 9, 3), "en-GB")).toBe("Saturday 3 October 2026");
    expect(formatHeaderDate(localDay(2026, 9, 3), "en-US")).toEqual({ year: "2026", label: "Sat, 3 Oct" });
  });

  it("describes day cells for screen readers", () => {
    const day = localDay(2026, 9, 3);
    expect(dayAccessibilityLabel(day, { selected: true }, "en-GB")).toBe("Saturday 3 October 2026, selected");
    expect(dayAccessibilityLabel(day, { today: true, disabled: true }, "en-GB")).toBe("Saturday 3 October 2026, today, not available");
    expect(dayAccessibilityLabel(day, {}, "en-GB")).toBe("Saturday 3 October 2026");
  });
});

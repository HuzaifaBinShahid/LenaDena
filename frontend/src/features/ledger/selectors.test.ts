import { describe, expect, it } from "vitest";
import { demoPlan } from "./demo-data";
import { getOpenBalanceTotals } from "./selectors";

describe("open balance totals", () => {
  it("includes open private obligations and excludes settled history", () => {
    expect(getOpenBalanceTotals(demoPlan)).toEqual([
      { currency: "PKR", oweMinor: 425000, owedMinor: 110000 },
    ]);
  });
});

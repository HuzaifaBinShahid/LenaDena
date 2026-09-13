import { describe, expect, it } from "vitest";
import { calculateShares } from "./split";

describe("calculateShares", () => {
  it("assigns equal-split remainder deterministically", () => {
    expect(calculateShares(100, ["a", "b", "c"], "equal", {}).map((share) => share.amountMinor)).toEqual([34, 33, 33]);
  });

  it("uses largest remainders for percentage splits", () => {
    const shares = calculateShares(100, ["a", "b", "c"], "percentage", { a: "33.33", b: "33.33", c: "33.34" });
    expect(shares.reduce((sum, share) => sum + share.amountMinor, 0)).toBe(100);
    expect(shares.reduce((sum, share) => sum + (share.percentageBasisPoints ?? 0), 0)).toBe(10000);
  });
});

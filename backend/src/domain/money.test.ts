import { describe, expect, it } from "vitest";
import { validateShares } from "./money.js";

describe("validateShares", () => {
  it("accepts exact integer allocation", () => {
    expect(() => validateShares(100, "exact", [
      { memberId: "a", amountMinor: 33 },
      { memberId: "b", amountMinor: 67 },
    ])).not.toThrow();
  });

  it("rejects allocation drift", () => {
    expect(() => validateShares(100, "equal", [
      { memberId: "a", amountMinor: 50 },
      { memberId: "b", amountMinor: 49 },
    ])).toThrow("add up exactly");
  });

  it("requires percentage basis points to total 10000", () => {
    expect(() => validateShares(100, "percentage", [
      { memberId: "a", amountMinor: 50, percentageBasisPoints: 5000 },
      { memberId: "b", amountMinor: 50, percentageBasisPoints: 4900 },
    ])).toThrow("100 percent");
  });
});

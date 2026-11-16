import { describe, expect, it } from "vitest";
import { isRecentPasswordSignIn, ownStoragePaths, RECENT_SIGN_IN_SECONDS } from "./account.js";

const NOW = 1_800_000_000;
const ME = "8a1f5c2e-4b3d-4e6f-8a7b-9c0d1e2f3a4b";
const OTHER = "6e2d0b8f-4c3a-4f9b-8d7e-3a8c9f5b2d14";

describe("isRecentPasswordSignIn", () => {
  it("accepts a password sign-in from the last ten minutes", () => {
    expect(isRecentPasswordSignIn(NOW - 5, NOW)).toBe(true);
    expect(isRecentPasswordSignIn(NOW - RECENT_SIGN_IN_SECONDS, NOW)).toBe(true);
  });

  it("refuses an older one, a missing one, and one from the future", () => {
    expect(isRecentPasswordSignIn(NOW - RECENT_SIGN_IN_SECONDS - 1, NOW)).toBe(false);
    expect(isRecentPasswordSignIn(undefined, NOW)).toBe(false);
    expect(isRecentPasswordSignIn(Number.NaN, NOW)).toBe(false);
    expect(isRecentPasswordSignIn(NOW + 3600, NOW)).toBe(false);
  });
});

describe("ownStoragePaths", () => {
  it("keeps only files in the person's own folder, once each", () => {
    expect(ownStoragePaths([`${ME}/a.jpg`, `${ME}/a.jpg`, `${ME}/b.png`], ME)).toEqual([`${ME}/a.jpg`, `${ME}/b.png`]);
  });

  it("drops anything that could reach another person's files", () => {
    const sneaky = [`${OTHER}/theirs.jpg`, `${ME}/../${OTHER}/theirs.jpg`, `${ME}x/a.jpg`, ME, "", 42, null, { path: `${ME}/a.jpg` }];
    expect(ownStoragePaths(sneaky, ME)).toEqual([]);
  });

  it("copes with something that is not a list", () => {
    for (const value of [undefined, null, "path", 7, {}]) expect(ownStoragePaths(value, ME)).toEqual([]);
  });
});

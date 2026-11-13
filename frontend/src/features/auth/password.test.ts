import { describe, expect, it } from "vitest";
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, passwordError, passwordIssues, passwordStrength, utf8Length } from "./password";

describe("password rules", () => {
  it("accepts a password with enough length, a letter and a number", () => {
    expect(passwordIssues("sunrise2026")).toEqual([]);
    expect(passwordError("sunrise2026")).toBeUndefined();
    expect(passwordIssues("a".repeat(PASSWORD_MIN_LENGTH - 1) + "1")).toEqual([]);
  });

  it("names what is wrong, in the order to fix it", () => {
    expect(passwordIssues("")).toEqual(["too_short", "needs_letter", "needs_number"]);
    expect(passwordIssues("abc123")).toEqual(["too_short"]);
    expect(passwordIssues("onlyletters")).toEqual(["needs_number"]);
    expect(passwordIssues("1234567890")).toEqual(["needs_letter"]);
    expect(passwordError("abc123")).toBe("Use at least 8 characters.");
    expect(passwordError("onlyletters")).toBe("Add at least one number.");
    expect(passwordError("1234567890")).toBe("Add at least one letter.");
  });

  it("counts characters, not UTF-16 units, for the minimum", () => {
    // Eight emoji are 8 characters (16 UTF-16 units) but have no letter or number.
    expect(passwordIssues("😀".repeat(8))).toEqual(["needs_letter", "needs_number"]);
    expect(passwordIssues("علیرضا12")).toEqual([]);
  });

  it("treats any script's letters and digits as letters and digits", () => {
    expect(passwordIssues("پاسورڈ١٢٣٤")).toEqual([]);
    expect(passwordIssues("пароль12345")).toEqual([]);
  });

  it("refuses more than 72 bytes, which bcrypt would not read", () => {
    expect(passwordIssues("a1".repeat(36))).toEqual([]);
    expect(utf8Length("a1".repeat(36))).toBe(PASSWORD_MAX_BYTES);
    expect(passwordIssues("a1".repeat(36) + "b")).toEqual(["too_long"]);
    // 25 Arabic letters are 50 bytes plus digits: fine. 40 are 80 bytes: too long although only 40 characters.
    expect(passwordIssues("ع".repeat(25) + "12345678")).toEqual([]);
    expect(passwordIssues("ع".repeat(40) + "1")).toEqual(["too_long"]);
  });

  it("measures UTF-8 length", () => {
    expect(utf8Length("abc")).toBe(3);
    expect(utf8Length("é")).toBe(2);
    expect(utf8Length("ع")).toBe(2);
    expect(utf8Length("€")).toBe(3);
    expect(utf8Length("😀")).toBe(4);
  });

  it("rates strength by length and variety, and never calls an invalid password anything but weak", () => {
    expect(passwordStrength("short1")).toBe("weak");
    expect(passwordStrength("onlyletters")).toBe("weak");
    expect(passwordStrength("sunrise2026")).toBe("okay");
    expect(passwordStrength("Sunrise#2026x")).toBe("strong");
    expect(passwordStrength("correcthorsebatterystaple9")).toBe("strong");
  });
});

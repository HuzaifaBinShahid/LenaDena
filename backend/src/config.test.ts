import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config.js";

afterEach(() => vi.unstubAllEnvs());

describe("contact settings for the public pages", () => {
  it("reads SUPPORT_EMAIL and OPERATOR_NAME, trimmed", () => {
    vi.stubEnv("SUPPORT_EMAIL", "  help@example.com ");
    vi.stubEnv("OPERATOR_NAME", "  Example Studio ");
    expect(loadConfig({ nodeEnv: "test" })).toMatchObject({ supportEmail: "help@example.com", operatorName: "Example Studio" });
  });

  it("leaves them unset when nothing is configured", () => {
    vi.stubEnv("SUPPORT_EMAIL", "");
    vi.stubEnv("OPERATOR_NAME", "");
    const config = loadConfig({ nodeEnv: "test" });
    expect(config).not.toHaveProperty("supportEmail");
    expect(config).not.toHaveProperty("operatorName");
  });

  it.each(["not an email", "a@b", "a b@example.com", "<x>@example.com", 'a"@example.com', "help@example.com\nBcc: x@example.com", `${"a".repeat(250)}@example.com`])(
    "ignores %j instead of stopping the API from starting",
    (value) => {
      expect(() => loadConfig({ nodeEnv: "test", supportEmail: value })).not.toThrow();
      expect(loadConfig({ nodeEnv: "test", supportEmail: value })).not.toHaveProperty("supportEmail");
    },
  );

  it("cuts an over-long operator name", () => {
    expect(loadConfig({ nodeEnv: "test", operatorName: "x".repeat(200) }).operatorName).toHaveLength(80);
  });
});

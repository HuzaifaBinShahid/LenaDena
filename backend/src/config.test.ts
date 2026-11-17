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

describe("Firebase credentials for push notifications", () => {
  const key = { project_id: "lena-dena-test", client_email: "push@lena-dena-test.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n" };

  it("reads FIREBASE_SERVICE_ACCOUNT_JSON", () => {
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", JSON.stringify(key));
    expect(loadConfig({ nodeEnv: "test" }).firebase).toEqual({ projectId: "lena-dena-test", clientEmail: key.client_email, privateKey: key.private_key.trim() });
    expect(loadConfig({ nodeEnv: "test" })).not.toHaveProperty("firebaseInvalid");
  });

  it("leaves pushes off when nothing is configured", () => {
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "");
    const config = loadConfig({ nodeEnv: "test" });
    expect(config).not.toHaveProperty("firebase");
    expect(config).not.toHaveProperty("firebaseInvalid");
  });

  it("starts anyway, with pushes off and a flag for the warning, when the value is not a usable key", () => {
    vi.stubEnv("FIREBASE_SERVICE_ACCOUNT_JSON", "this is not json");
    expect(() => loadConfig({ nodeEnv: "test" })).not.toThrow();
    const config = loadConfig({ nodeEnv: "test" });
    expect(config).not.toHaveProperty("firebase");
    expect(config.firebaseInvalid).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { authReturnPath, parseAuthLink } from "./authLinks";

const CODE = "6d1f0b6e-5d0c-4c1e-9d5e-2f4a8f3c1b77";

describe("parseAuthLink", () => {
  it("reads the one-time code Supabase puts on a confirm or reset link", () => {
    expect(parseAuthLink(`lenadena:///?code=${CODE}`)).toEqual({ kind: "code", code: CODE });
    expect(parseAuthLink(`lenadena:///reset-password?code=${CODE}`)).toEqual({ kind: "code", code: CODE });
    expect(parseAuthLink(`exp://192.168.18.75:8081/--/?code=${CODE}`)).toEqual({ kind: "code", code: CODE });
    expect(parseAuthLink(`lenadena:///?code=${CODE}#section`)).toEqual({ kind: "code", code: CODE });
  });

  it("reads an error from the query or the fragment, whichever Supabase used", () => {
    const description = "Email+link+is+invalid+or+has+expired";
    expect(parseAuthLink(`lenadena:///?error=access_denied&error_code=otp_expired&error_description=${description}`)).toEqual({
      kind: "error",
      code: "otp_expired",
      description: "Email link is invalid or has expired",
    });
    expect(parseAuthLink(`lenadena:///#error=access_denied&error_code=otp_expired&error_description=${description}`)).toMatchObject({ kind: "error", code: "otp_expired" });
    expect(parseAuthLink("lenadena:///?error=server_error")).toEqual({ kind: "error", code: "server_error", description: "" });
  });

  it("puts an error ahead of a code, so a failed link never half-signs anyone in", () => {
    expect(parseAuthLink(`lenadena:///?code=${CODE}&error=access_denied`)).toMatchObject({ kind: "error" });
  });

  it("ignores session tokens in a link: a link can no longer hand this phone someone else's session", () => {
    expect(parseAuthLink("lenadena:///#access_token=abc.def.ghi&refresh_token=xyz&type=signup")).toEqual({ kind: "none" });
    expect(parseAuthLink("lenadena:///?access_token=abc&refresh_token=xyz")).toEqual({ kind: "none" });
  });

  it("ignores anything that is not an auth link", () => {
    for (const url of [undefined, null, "", "lenadena:///", "lenadena:///invite/abc123", "lenadena:///?tab=activity", `lenadena:///?code=short`, `lenadena:///?code=${"x".repeat(600)}`, "lenadena:///?code=has spaces in it"]) {
      expect(parseAuthLink(url)).toEqual({ kind: "none" });
    }
  });

  it("caps what it will carry from a link", () => {
    const link = parseAuthLink(`lenadena:///?error=e&error_code=${"c".repeat(300)}&error_description=${"d".repeat(900)}`);
    expect(link.kind === "error" && link.code.length).toBe(80);
    expect(link.kind === "error" && link.description.length).toBe(200);
  });
});

describe("authReturnPath", () => {
  it("resumes only invite links", () => {
    expect(authReturnPath("/invite/abc_DEF-123")).toBe("/invite/abc_DEF-123");
    for (const next of [undefined, "", "/", "/settings", "//evil.example", "https://evil.example", "/invite/", "/invite/a/b", "/invite/a?x=1"]) {
      expect(authReturnPath(next)).toBe("/");
    }
  });
});

import { describe, expect, it } from "vitest";
import { authErrorKind, describeAuthError, isNetworkFailure } from "./authErrors";

const apiError = (code: string, message = "msg", status = 400) => ({ name: "AuthApiError", code, message, status });

describe("authErrorKind", () => {
  it.each([
    [apiError("invalid_credentials", "Invalid login credentials"), "invalid_credentials"],
    [{ message: "Invalid login credentials" }, "invalid_credentials"],
    [apiError("email_not_confirmed", "Email not confirmed"), "email_not_confirmed"],
    [apiError("user_already_exists", "User already registered", 422), "user_exists"],
    [apiError("email_exists"), "user_exists"],
    [apiError("same_password", "New password should be different from the old password.", 422), "same_password"],
    [apiError("weak_password", "Password should be at least 8 characters", 422), "weak_password"],
    [{ name: "AuthWeakPasswordError", message: "weak" }, "weak_password"],
    [apiError("over_request_rate_limit", "Request rate limit reached", 429), "rate_limited"],
    [apiError("over_email_send_rate_limit", "email rate limit exceeded", 429), "rate_limited"],
    [{ status: 429, message: "slow down" }, "rate_limited"],
    [apiError("signup_disabled", "Signups not allowed", 422), "signups_disabled"],
    [apiError("email_address_invalid", "Email address is invalid"), "invalid_email"],
    [apiError("otp_expired", "Email link is invalid or has expired", 403), "link_expired"],
    [apiError("flow_state_not_found", "invalid flow state, no valid flow state found"), "link_expired"],
    [{ message: "code verifier should be non-empty" }, "link_expired"],
    [apiError("reauthentication_needed", "Reauthentication needed"), "reauthenticate"],
    [apiError("something_new", "who knows"), "unknown"],
    [null, "unknown"],
    ["oops", "unknown"],
  ])("classifies %j as %s", (error, kind) => {
    expect(authErrorKind(error)).toBe(kind);
  });

  it("recognises a request that never reached Supabase", () => {
    expect(isNetworkFailure({ name: "AuthRetryableFetchError", message: "Failed to fetch" })).toBe(true);
    expect(isNetworkFailure(new TypeError("Network request failed"))).toBe(true);
    expect(isNetworkFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkFailure(new TypeError("Cannot read properties of undefined"))).toBe(false);
    expect(authErrorKind(new TypeError("Network request failed"))).toBe("network");
  });
});

describe("describeAuthError", () => {
  it("does not say which half of a wrong sign-in was wrong", () => {
    const copy = describeAuthError(apiError("invalid_credentials"), "sign_in");
    expect(copy.title).toBe("Couldn't sign you in");
    expect(copy.message).toMatch(/email and password don't match/);
    expect(copy.message).not.toMatch(/no account|not found|wrong password/i);
  });

  it("sends an unconfirmed account to its email link", () => {
    expect(describeAuthError(apiError("email_not_confirmed"), "sign_in")).toMatchObject({ kind: "email_not_confirmed", title: "Confirm your email first" });
  });

  it("titles each failure for what the person was doing", () => {
    expect(describeAuthError(apiError("weak_password"), "sign_up").title).toBe("Couldn't create your account");
    expect(describeAuthError(apiError("weak_password"), "update").title).toBe("Couldn't change your password");
    expect(describeAuthError(apiError("over_request_rate_limit", "x", 429), "reset").title).toBe("Too many attempts");
    expect(describeAuthError(apiError("otp_expired"), "link").title).toBe("That link has expired");
  });

  it("shows a short unknown message from Supabase and hides a long or empty one", () => {
    expect(describeAuthError(apiError("odd", "Database error saving new user", 500), "sign_up").message).toBe("Database error saving new user");
    expect(describeAuthError(apiError("odd", "x".repeat(200), 500), "sign_up").message).toBe("Something went wrong. Please try again.");
    expect(describeAuthError(apiError("odd", "   ", 500), "sign_up").message).toBe("Something went wrong. Please try again.");
    expect(describeAuthError(undefined, "sign_in").message).toBe("Something went wrong. Please try again.");
  });

  it("explains a connection problem", () => {
    expect(describeAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch" }, "sign_in").message).toMatch(/can't reach its server/);
  });
});

// Friendly copy for the errors Supabase Auth can answer. Pure (Vitest runs it): no react-native, no supabase-js import,
// so it reads the error's shape (`code`, `status`, `name`, `message`) rather than its class.

export type AuthContext = "sign_in" | "sign_up" | "reset" | "update" | "resend" | "link";

export type AuthErrorKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "user_exists"
  | "weak_password"
  | "same_password"
  | "rate_limited"
  | "signups_disabled"
  | "invalid_email"
  | "link_expired"
  | "reauthenticate"
  | "network"
  | "unknown";

export type AuthErrorCopy = { kind: AuthErrorKind; title: string; message: string };

type ErrorShape = { name?: unknown; code?: unknown; status?: unknown; message?: unknown };

function shape(error: unknown): ErrorShape {
  return error && typeof error === "object" ? (error as ErrorShape) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A request that never reached Supabase: no signal, a captive portal, a server that is down. */
export function isNetworkFailure(error: unknown): boolean {
  const { name, message } = shape(error);
  if (name === "AuthRetryableFetchError") return true;
  return error instanceof TypeError && /network request failed|failed to fetch|load failed|fetch failed/i.test(text(message));
}

export function authErrorKind(error: unknown): AuthErrorKind {
  const { code, status, message } = shape(error);
  const c = text(code);
  const m = text(message).toLowerCase();
  if (isNetworkFailure(error)) return "network";
  if (c === "invalid_credentials" || m.includes("invalid login credentials")) return "invalid_credentials";
  if (c === "email_not_confirmed" || m.includes("email not confirmed")) return "email_not_confirmed";
  if (c === "user_already_exists" || c === "email_exists" || m.includes("already registered") || m.includes("already been registered")) return "user_exists";
  if (c === "same_password" || m.includes("different from the old password") || m.includes("same as the old password")) return "same_password";
  if (c === "weak_password" || text(shape(error).name) === "AuthWeakPasswordError") return "weak_password";
  if (c === "over_request_rate_limit" || c === "over_email_send_rate_limit" || c === "over_sms_send_rate_limit" || status === 429 || m.includes("rate limit")) return "rate_limited";
  if (c === "signup_disabled" || c === "email_provider_disabled") return "signups_disabled";
  if (c === "email_address_invalid" || c === "validation_failed" || m.includes("unable to validate email")) return "invalid_email";
  if (["otp_expired", "flow_state_expired", "flow_state_not_found", "bad_code_verifier", "bad_oauth_callback", "pkce_code_verifier_not_found", "validation_failed"].includes(c) || m.includes("expired") || m.includes("code verifier") || m.includes("invalid flow state")) return "link_expired";
  if (c === "reauthentication_needed" || c === "reauthentication_not_valid" || m.includes("reauthentication")) return "reauthenticate";
  return "unknown";
}

const FAILURE_TITLE: Record<AuthContext, string> = {
  sign_in: "Couldn't sign you in",
  sign_up: "Couldn't create your account",
  reset: "Couldn't send the reset email",
  update: "Couldn't change your password",
  resend: "Couldn't send the email",
  link: "That link didn't work",
};

/** The title and sentence to show for a failed sign-in, sign-up, reset, password change, resend or email link. */
export function describeAuthError(error: unknown, context: AuthContext): AuthErrorCopy {
  const kind = authErrorKind(error);
  const title = FAILURE_TITLE[context];
  switch (kind) {
    case "invalid_credentials":
      return { kind, title, message: "That email and password don't match. Check them and try again, or reset your password." };
    case "email_not_confirmed":
      return { kind, title: "Confirm your email first", message: "We sent you a link when you signed up. Open it on this phone, or ask for a new one." };
    case "user_exists":
      return { kind, title: "You already have an account", message: "An account already uses this email. Sign in instead, or reset your password if you've forgotten it." };
    case "weak_password":
      return { kind, title, message: "Choose a stronger password: at least 8 characters, with a letter and a number." };
    case "same_password":
      return { kind, title, message: "Choose a password that's different from your current one." };
    case "rate_limited":
      return { kind, title: "Too many attempts", message: "Wait a few minutes before trying again." };
    case "signups_disabled":
      return { kind, title, message: "New accounts can't be created right now. Try again later." };
    case "invalid_email":
      return { kind, title, message: "Enter a valid email address." };
    case "link_expired":
      return { kind, title: "That link has expired", message: "Links work once and only for a short time. Ask for a new one and open it on this phone." };
    case "reauthenticate":
      return { kind, title, message: "For your security, sign out and sign in again, then try once more." };
    case "network":
      return { kind, title, message: "LenaDena can't reach its server. Check your connection and try again." };
    default: {
      const detail = text(shape(error).message).trim();
      return { kind, title, message: detail && detail.length <= 140 ? detail : "Something went wrong. Please try again." };
    }
  }
}

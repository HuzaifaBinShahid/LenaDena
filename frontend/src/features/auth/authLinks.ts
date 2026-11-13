// What an email link brings back into the app. Pure (Vitest runs it): no react-native.
//
// Supabase's confirm-email and reset-password links open the app with a one-time `code` (the PKCE flow). The code is
// only useful to the phone that asked for the email, because that phone holds the matching secret: a link crafted by
// someone else cannot sign this phone into their account. A failed link carries `error*` fields instead.

export type AuthLink =
  | { kind: "code"; code: string }
  | { kind: "error"; code: string; description: string }
  | { kind: "none" };

function paramsOf(url: string): URLSearchParams[] {
  const hashAt = url.indexOf("#");
  const queryAt = url.indexOf("?");
  const fragment = hashAt >= 0 ? url.slice(hashAt + 1) : "";
  const query = queryAt >= 0 ? url.slice(queryAt + 1, hashAt >= 0 && hashAt > queryAt ? hashAt : undefined) : "";
  return [new URLSearchParams(query), new URLSearchParams(fragment)];
}

/** A code can be long but never huge: anything else is not from Supabase. */
const CODE_PATTERN = /^[A-Za-z0-9._~-]{8,512}$/;

export function parseAuthLink(url: string | null | undefined): AuthLink {
  if (!url) return { kind: "none" };
  for (const params of paramsOf(url)) {
    const error = params.get("error") ?? params.get("error_code");
    if (error) {
      return {
        kind: "error",
        code: (params.get("error_code") ?? error).slice(0, 80),
        description: (params.get("error_description") ?? "").replace(/\+/g, " ").slice(0, 200),
      };
    }
  }
  for (const params of paramsOf(url)) {
    const code = params.get("code");
    if (code && CODE_PATTERN.test(code)) return { kind: "code", code };
  }
  return { kind: "none" };
}

/** Where an invite resumes after sign-in: only invite links, never an arbitrary path. */
export function authReturnPath(next: string | undefined) {
  return next && /^\/invite\/[A-Za-z0-9_-]+$/.test(next) ? next : "/";
}

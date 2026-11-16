/** The public pages the stores ask for. The API serves them itself (backend/src/routes/pages.ts). */
export type LegalPage = "privacy" | "delete-account";

/**
 * Where a public page lives: the same host as the API, so it needs no extra setting. Kept free of the Supabase and
 * network code in `api.ts` so it can be tested on its own.
 */
export function legalPageUrl(page: LegalPage, apiBase: string | undefined = process.env.EXPO_PUBLIC_API_URL): string {
  const root = (apiBase ?? "").trim().replace(/\/+$/, "") || "http://localhost:3000";
  return `${root}/${page}`;
}

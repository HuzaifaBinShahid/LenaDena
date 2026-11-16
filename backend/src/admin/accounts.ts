import type { SupabaseClient } from "@supabase/supabase-js";

type AdminUsers = Pick<SupabaseClient["auth"]["admin"], "listUsers">;

/**
 * Finds a person's sign-in by their email address, for requests that arrive by email. The Auth admin API has no lookup
 * by address, so this reads the accounts one page at a time until it finds the match; that is fine at this size.
 */
export async function findUserIdByEmail(admin: AdminUsers, email: string, perPage = 200): Promise<string | undefined> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return undefined;
  for (let page = 1; page <= 1000; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not read the accounts: ${error.message}`);
    const match = data.users.find((user) => user.email?.trim().toLowerCase() === wanted);
    if (match) return match.id;
    if (data.users.length < perPage) return undefined;
  }
  return undefined;
}

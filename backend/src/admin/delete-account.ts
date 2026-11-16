// Deletes an account on request, for people who cannot use the in-app "Delete account" (the /delete-account page offers
// this by email). It runs exactly what the app's own deletion runs: the person's files are removed from storage, the
// database rows are deleted or anonymised, then the sign-in is removed.
//
//   pnpm --filter @lenadena/backend delete-account -- person@example.com          (shows what it would do, changes nothing)
//   pnpm --filter @lenadena/backend delete-account -- person@example.com --yes    (deletes)
//
// Reads SUPABASE_URL and SUPABASE_SECRET_KEY from backend/.env. Only run it after the person has confirmed from the
// address on the account (documentation/DEPLOYMENT.md, "Deletion requests by email"). It cannot be undone.
import { createClient } from "@supabase/supabase-js";
import { SupabaseLedgerRepository } from "../repositories/SupabaseLedgerRepository.js";
import { findUserIdByEmail } from "./accounts.js";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const email = args.find((arg) => !arg.startsWith("-"));
const confirmed = args.includes("--yes");

if (!email || args.some((arg) => arg.startsWith("-") && arg !== "--yes")) {
  console.error("Usage: pnpm --filter @lenadena/backend delete-account -- <email address> [--yes]");
  process.exit(2);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set (backend/.env).");
  process.exit(2);
}

const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

try {
  const userId = await findUserIdByEmail(client.auth.admin, email);
  if (!userId) {
    console.error("No account has that email address. Nothing was changed.");
    process.exit(1);
  }
  const listed = await client.rpc("app_account_storage_paths", { p_actor: userId });
  if (listed.error) throw new Error(`Could not read the account's files: ${listed.error.message}`);
  const files = listed.data as { avatars?: string[]; receipts?: string[] };
  console.log(`Account ${userId}`);
  console.log(`  photos to remove from storage:    ${files.avatars?.length ?? 0}`);
  console.log(`  receipts to remove from storage:  ${files.receipts?.length ?? 0}`);
  if (!confirmed) {
    console.log("\nDry run: nothing was changed. Run again with --yes to delete this account for good.");
    process.exit(0);
  }
  await new SupabaseLedgerRepository(client).deleteAccount(userId);
  console.log("\nDeleted. The sign-in, private records and files are gone; shared group records now show \"Deleted user\".");
} catch (error) {
  console.error(`\nNot finished: ${error instanceof Error ? error.message : String(error)}`);
  console.error("The deletion can be run again safely.");
  process.exit(1);
}

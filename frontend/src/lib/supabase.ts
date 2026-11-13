import "expo-sqlite/localStorage/install";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && key
  ? createClient(url, key, {
      auth: {
        storage: globalThis.localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // Email links carry a one-time code that only this phone can redeem, not the session itself.
        flowType: "pkce",
        // Each email link names the request it answers (`sb_flow_id`), so a resend, a second reset or a forged link
        // cannot use up the secret another link needs. The redirect allow-list entry `lenadena://**` covers it.
        experimental: { appendPkceFlowIdToRedirects: true },
      },
    })
  : null;

export const hasSupabaseConfig = Boolean(supabase);

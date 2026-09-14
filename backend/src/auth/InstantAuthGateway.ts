import type { SupabaseClient, User } from "@supabase/supabase-js";

export type InstantAccount = {
  id: string;
  name: string;
};

export type SignInToken = {
  /** Single-use hash the client exchanges with `supabase.auth.verifyOtp({ type: "email" })` for a session. */
  tokenHash: string;
  account: InstantAccount;
};

/** Narrow view of the Supabase Auth admin operations behind instant email authentication. */
export interface InstantAuthGateway {
  /** Creates an already-confirmed account. Returns `null` when the email is registered. */
  createAccount(email: string, name: string): Promise<InstantAccount | null>;
  /** Returns `null` when no account uses the email; never creates one. */
  issueSignInToken(email: string): Promise<SignInToken | null>;
}

function accountFromUser(user: User, email: string): InstantAccount {
  const name = user.user_metadata?.name;
  return { id: user.id, name: typeof name === "string" && name.trim() ? name.trim() : email.split("@")[0] ?? "Friend" };
}

/**
 * Uses only the Auth admin API: the service role has no direct table privileges in this project,
 * where every database read goes through SECURITY DEFINER functions.
 */
export class SupabaseInstantAuthGateway implements InstantAuthGateway {
  constructor(private readonly client: SupabaseClient) {}

  async createAccount(email: string, name: string): Promise<InstantAccount | null> {
    const { data, error } = await this.client.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name },
    });
    if (error) {
      if (error.code === "email_exists" || error.code === "user_already_exists") return null;
      throw error;
    }
    return accountFromUser(data.user, email);
  }

  async issueSignInToken(email: string): Promise<SignInToken | null> {
    // A "recovery" link is Supabase's magic link for existing users only: unlike "magiclink",
    // it answers user_not_found instead of silently creating an account for a mistyped email.
    const { data, error } = await this.client.auth.admin.generateLink({ type: "recovery", email });
    if (error) {
      if (error.code === "user_not_found" || error.status === 404) return null;
      throw error;
    }
    if (!data.properties.hashed_token) throw new Error("Supabase did not return a sign-in token");
    return { tokenHash: data.properties.hashed_token, account: accountFromUser(data.user, email) };
  }
}

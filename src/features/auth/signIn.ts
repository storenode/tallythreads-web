import { supabaseAuthClient } from "@/lib/supabaseAuthClient";

/**
 * Kicks off Supabase's Google OAuth handshake. This is only a credential check —
 * the resulting Supabase-managed session is disposable plumbing, consumed once by
 * AuthCallbackPage (which calls mint-member-session) and then discarded. See
 * specs/tasks/M1-auth-google.md.
 */
export async function signInWithGoogle() {
  const { error } = await supabaseAuthClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      // Without this, Google silently reuses whichever Google account is already
      // signed in on the browser instead of showing the account chooser — a real
      // problem for a shared store device where staff need to switch accounts.
      queryParams: { prompt: "select_account" },
    },
  });

  if (error) throw error;
}

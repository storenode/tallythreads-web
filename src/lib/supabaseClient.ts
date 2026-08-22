import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, supabaseAnonKey } from "@/lib/supabaseEnv";
import { getMemberJwt } from "@/lib/memberSession";

/**
 * `accessToken` (not `auth.setSession`) is how a custom, non-Supabase-issued JWT is
 * plugged into supabase-js — our member JWT has no matching Supabase-managed refresh
 * token, so it can't go through the normal session-refresh flow setSession expects.
 * Once a member is signed in, every request (REST, Realtime) automatically carries
 * this token, resolving auth.uid() to members.id in RLS policies.
 *
 * Configuring `accessToken` disables `supabase.auth.*` methods (signInWithOAuth
 * included) on this client entirely — that's why the Google OAuth handshake itself
 * uses the separate plain client in supabaseAuthClient.ts, not this one.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: getMemberJwt,
});

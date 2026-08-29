const log = (...args: unknown[]) => console.log("[resolvePostSignInPath]", ...args);

/**
 * Where to send a member right after sign-in (Google or PIN) completes.
 *
 * Simplified as part of the 2026-08-29 frontend cleanup: this repo was pared back
 * to just Google login + PIN setup + the Supabase PostgREST client, so there's no
 * admin console or org portal to route into anymore. Everyone lands on the same
 * placeholder ("/no-store" — kept as the generic "you're signed in" landing page,
 * see NoStoreAssignedPage.tsx) until real post-login product screens exist again.
 *
 * Kept as its own function (rather than inlining "/no-store" at each call site —
 * LoginPage.tsx and SetPinPage.tsx both call this) so there's one place to change
 * once there's somewhere real to send people.
 */
export async function resolvePostSignInPath(memberId: string): Promise<string> {
  log("called for memberId =", memberId, "-> /no-store (placeholder, see comment above)");
  return "/no-store";
}

import type { QueryClient } from "@tanstack/react-query";
import { primeEntitlements } from "@/features/auth/entitlements";
import { getAccessibleAreas } from "@/features/auth/getAccessibleAreas";

const log = (...args: unknown[]) =>
  console.log("[resolvePostSignInPath]", ...args);

/**
 * Where to send a member right after sign-in (Google or PIN) completes.
 *
 * Delegates entirely to getAccessibleAreas() — the same function AreaSwitcher and
 * RequireArea use — instead of keeping its own separate priority list, so "where
 * sign-in lands you" and "what the header switcher offers" can never disagree:
 *   - Zero accessible areas -> "/no-store", the generic "you're signed in" placeholder.
 *   - Exactly one accessible area -> straight there. /org and /ops each still resolve
 *     "which org/store" themselves (auto-redirect for exactly one, a picker for more).
 *   - More than one accessible area -> "/launch", a picker over the areas themselves
 *     (LaunchPage.tsx).
 *
 * Bugfix (2026-08-31, later): the previous fixed priority order — platform_admin,
 * then org, then store — meant a platform_admin who was *also* a real org_owner/
 * org_manager and a store_manager always got silently routed to /admin, with no
 * prompt and no way to reach their org/store access except the header AreaSwitcher.
 * Confirmed live for exactly that combination. Replaced with getAccessibleAreas()
 * plus the new /launch picker so nobody with more than one real area gets a decision
 * made for them.
 *
 * Bugfix (2026-08-30): before that, this fell straight through to "/no-store" for
 * every non-platform-admin member, even ones with real org/store entitlements —
 * confirmed live for an org_owner tagged on two organizations. The org/store
 * branches were missing entirely.
 *
 * Bugfix (2026-09-02): the getAccessibleAreas() rewrite above dropped this
 * function down to a single `memberId` parameter and swapped in a plain
 * fetchEntitlements() + cacheEntitlements() pair — but both call sites
 * (LoginPage.tsx, SetPinPage.tsx) still call `resolvePostSignInPath(queryClient,
 * memberId)`, unchanged. With only one declared parameter, `memberId` inside this
 * function was actually binding to the *QueryClient instance* passed as the first
 * argument, and the real member id (the second argument) was silently dropped.
 * cacheEntitlements(memberId, ...) then tried to store that QueryClient object as
 * an IndexedDB key, which fails structured-clone (functions aren't cloneable) and
 * rejects — leaving the calling page's handleSubmit with an unhandled rejection
 * and no navigation. Restored the original (queryClient, memberId) signature and
 * switched to primeEntitlements(), which does what the two calls here used to do
 * together (fetch + seed both the Dexie cache *and* the React Query cache the
 * rest of the app reads via useEntitlements — LaunchPage's own fetch is then an
 * instant cache hit instead of a redundant refetch).
 *
 * Kept as its own function (rather than inlining the paths at each call site —
 * LoginPage.tsx and SetPinPage.tsx both call this) so there's one place to change
 * routing as more destinations are built.
 */
export async function resolvePostSignInPath(
  queryClient: QueryClient,
  memberId: string,
): Promise<string> {
  const entitlements = await primeEntitlements(queryClient, memberId);
  log("memberId =", memberId, "entitlements =", entitlements);

  const areas = getAccessibleAreas(entitlements);
  if (areas.length === 0) return "/no-store";
  if (areas.length === 1) return areas[0].to;
  return "/launch";
}

import type { QueryClient } from "@tanstack/react-query";
import { primeEntitlements } from "@/features/auth/entitlements";

/**
 * Where to send a member right after sign-in (Google or PIN) completes.
 *
 * Priority mirrors getAccessibleAreas.ts exactly, so "where sign-in lands you" and
 * "what the area switcher offers" never disagree:
 *   1. Platform admins land on "/admin".
 *   2. Members tagged on one or more organizations land on "/org" — OrgPickerPage
 *      itself resolves "which org" (auto-redirect for exactly one, a picker for more).
 *   3. Members with only store-level access land on "/ops" — same "which store"
 *      resolution via StorePickerPage, spanning stores across organizations.
 *   4. Nobody at all lands on "/no-store", the generic "you're signed in" placeholder.
 *
 * Bugfix (2026-08-30): this previously fell straight through to "/no-store" for
 * every non-platform-admin member, even ones with real org/store entitlements —
 * confirmed live for an org_owner tagged on two organizations. The org/store
 * branches below were missing entirely.
 *
 * Kept as its own function (rather than inlining the paths at each call site —
 * LoginPage.tsx and SetPinPage.tsx both call this) so there's one place to change
 * routing as more destinations are built.
 *
 * Takes the caller's QueryClient and primes it (plus the Dexie cache) with the
 * entitlements it fetches, so the guards / OrgPickerPage that render at the
 * destination read a cache hit instead of re-fetching the same rows.
 */
export async function resolvePostSignInPath(
  queryClient: QueryClient,
  memberId: string,
): Promise<string> {
  const entitlements = await primeEntitlements(queryClient, memberId);

  if (entitlements.platformRole === "platform_admin") return "/admin";
  if (entitlements.organizations.length > 0) return "/org";
  if (entitlements.stores.length > 0) return "/ops";
  return "/no-store";
}

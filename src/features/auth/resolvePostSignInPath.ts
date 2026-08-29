import { fetchEntitlements } from "@/features/auth/entitlements";
import { cacheEntitlements } from "@/lib/entitlementsCache";

const log = (...args: unknown[]) =>
  console.log("[resolvePostSignInPath]", ...args);

/**
 * Where to send a member right after sign-in (Google or PIN) completes.
 *
 * Platform admins land on "/admin" (the admin console shell). Everyone else lands
 * on "/no-store" — the generic "you're signed in" placeholder (see
 * NoStoreAssignedPage.tsx) — until real post-login product screens exist again.
 *
 * Kept as its own function (rather than inlining the paths at each call site —
 * LoginPage.tsx and SetPinPage.tsx both call this) so there's one place to change
 * routing as more destinations are built.
 */
export async function resolvePostSignInPath(memberId: string): Promise<string> {
  const entitlements = await fetchEntitlements();
  await cacheEntitlements(memberId, entitlements);
  log("memberId =", memberId, "entitlements =", entitlements);
  return entitlements.platformRole === "platform_admin"
    ? "/admin"
    : "/no-store";
}

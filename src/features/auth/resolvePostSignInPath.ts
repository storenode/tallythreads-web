import { fetchEntitlements } from "@/features/auth/useEntitlements";

/**
 * Where to send a member right after sign-in completes, based on their platform role.
 * Only platform_admin has a distinct destination today — everyone else lands on the
 * /no-store placeholder until Phase 3 adds real org/store-based routing (M1b §5).
 */
export async function resolvePostSignInPath(memberId: string): Promise<string> {
  const entitlements = await fetchEntitlements(memberId);
  return entitlements.platformRole === "platform_admin" ? "/admin" : "/no-store";
}

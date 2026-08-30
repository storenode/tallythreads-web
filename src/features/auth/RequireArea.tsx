import { Navigate, Outlet } from "react-router-dom";
import { useMember } from "@/features/auth/useMember";
import {
  useEntitlements,
  type Entitlements,
} from "@/features/auth/entitlements";
import type { AreaKey } from "@/features/auth/getAccessibleAreas";

function isAllowed(
  entitlements: Entitlements | undefined,
  area: AreaKey,
): boolean {
  if (!entitlements) return false;
  switch (area) {
    case "admin":
      return entitlements.platformRole === "platform_admin";
    case "org":
      return entitlements.organizations.length > 0;
    case "ops":
      return entitlements.stores.length > 0;
  }
}

interface RequireAreaProps {
  area: AreaKey;
}

/**
 * Sits *inside* AuthGuard (which only checks "is anyone signed in") and gates one
 * specific top-level area — /admin, /org, or /ops. This is a UX nicety, not the real
 * security boundary: it just avoids showing a signed-in member an empty/broken area
 * they have no reason to be in. RLS (has_org_permission/is_platform_admin) remains
 * the actual authorization boundary for every read/write once inside — see
 * M-admin-org-module.md §4/§6 and constitution.md's identity/access separation rule.
 *
 * Renders nothing while entitlements are still resolving (avoids a flash-redirect
 * before the fetch settles) — same pattern AuthGuard itself uses for isLoading.
 */
export function RequireArea({ area }: RequireAreaProps) {
  const { member, isLoading: memberLoading } = useMember();
  const { data: entitlements, isError } = useEntitlements(member?.id);

  // Wait until entitlements have actually resolved. `isLoading` can briefly be
  // false while `data` is still undefined (observer just enabled), and acting on
  // that gap sends a member with real access to /no-store — then the post-sign-in
  // resolver bounces them back here, looping.
  if (memberLoading || (member && !entitlements && !isError)) {
    return null;
  }

  if (!isAllowed(entitlements, area)) {
    return <Navigate to="/no-store" replace />;
  }

  return <Outlet />;
}

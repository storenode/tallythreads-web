import { Navigate, Outlet, useParams } from "react-router-dom";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements } from "@/features/auth/entitlements";

/**
 * Sits inside RequireArea area="org" (which already confirmed the member has *some*
 * org access) and validates that the specific :orgId in the URL is one they actually
 * hold — otherwise a member could edit the URL to another org's id and the shell
 * would render for it (RLS would still block real data, but there's no reason to let
 * the shell itself render for the wrong org). A mismatch sends them back to `/org`
 * — which will then resolve/re-offer the picker — not `/no-store`, since they do
 * have valid org access, just not to this particular id.
 */
export function RequireOrgAccess() {
  const { orgId } = useParams<{ orgId: string }>();
  const { member, isLoading: memberLoading } = useMember();
  const { data: entitlements, isError } = useEntitlements(member?.id);

  if (memberLoading || (member && !entitlements && !isError)) {
    return null;
  }

  const allowed =
    entitlements?.organizations.some((o) => o.organizationId === orgId) ?? false;

  if (!allowed) {
    return <Navigate to="/org" replace />;
  }

  return <Outlet />;
}

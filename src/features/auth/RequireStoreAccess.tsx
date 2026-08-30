import { Navigate, Outlet, useParams } from "react-router-dom";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements } from "@/features/auth/entitlements";

/**
 * Store-level counterpart of RequireOrgAccess — validates the specific :storeId in
 * the URL against the member's entitlements.stores, not just "has some store
 * access". A mismatch sends them back to `/ops` (which resolves/re-offers the
 * picker), not `/no-store`.
 */
export function RequireStoreAccess() {
  const { storeId } = useParams<{ storeId: string }>();
  const { member, isLoading: memberLoading } = useMember();
  const { data: entitlements, isError } = useEntitlements(member?.id);

  if (memberLoading || (member && !entitlements && !isError)) {
    return null;
  }

  const allowed = entitlements?.stores.some((s) => s.storeId === storeId) ?? false;

  if (!allowed) {
    return <Navigate to="/ops" replace />;
  }

  return <Outlet />;
}

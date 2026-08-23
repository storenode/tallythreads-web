import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useMember } from "@/features/auth/useMember";
import {
  resolveEntitlements,
  hasPermission as hasPermissionPure,
  type Entitlements,
  type EntitlementsSource,
  type PermissionScope,
} from "@/lib/entitlements";

export interface EntitlementsState {
  entitlements: Entitlements | undefined;
  isLoading: boolean;
  /** Convenience wrapper over the pure `hasPermission` bound to this session's fetched rows. */
  hasPermission: (permission: string, scope: PermissionScope) => boolean;
}

const EMPTY_SOURCE: EntitlementsSource = {
  memberships: [],
  roles: [],
  permissions: [],
  rolePermissions: [],
  stores: [],
};

// Module-level, keyed by member id — "once per session" per M1b §4 subtask 6, not
// once per component mount. A remount (e.g. navigating between /app screens) reuses
// the same fetch instead of re-querying; a different member signing in on the same
// device (see memberSession.ts's multi-member cache) gets its own fetch.
const sessionCache = new Map<string, EntitlementsSource>();

/**
 * Fetches this member's own rows once per session and resolves them through the pure
 * `resolveEntitlements`/`hasPermission` from src/lib/entitlements.ts. This is the
 * client's read of "what should I show" — never the authorization boundary itself
 * (M1b §4): every mutating Edge Function re-derives its own answer server-side from
 * the same underlying logic, since a cached client snapshot can't be trusted for that.
 */
export function useEntitlements(): EntitlementsState {
  const { member, isLoading: isMemberLoading } = useMember();
  const memberId = member?.id;

  const [source, setSource] = useState<EntitlementsSource | undefined>(
    memberId ? sessionCache.get(memberId) : undefined,
  );
  const [isFetching, setIsFetching] = useState(false);
  const fetchedForMemberId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!memberId) {
      fetchedForMemberId.current = undefined;
      setSource(undefined);
      return;
    }

    const cached = sessionCache.get(memberId);
    if (cached) {
      setSource(cached);
      return;
    }

    if (fetchedForMemberId.current === memberId) return; // already in flight
    fetchedForMemberId.current = memberId;

    let cancelled = false;
    setIsFetching(true);

    async function fetchAndResolve() {
      // memberships: this member's own rows only (RLS/query filter — the entitlements
      // this hook exists to compute are exactly the rows a member is allowed to see
      // about themselves). roles/permissions/role_permissions: small, effectively
      // static reference tables, fetched in full. stores: needed for the org→store
      // cascade, so every store is fetched rather than pre-filtering — filtering by
      // organization_id would require already knowing which orgs this member has
      // before the query that determines it.
      const [membershipsRes, rolesRes, permissionsRes, rolePermissionsRes, storesRes] =
        await Promise.all([
          supabase
            .from("memberships")
            .select("id, member_id, role_id, organization_id, store_id, deleted_at")
            .eq("member_id", memberId),
          supabase.from("roles").select("id, name, scope_type"),
          supabase.from("permissions").select("id, key"),
          supabase.from("role_permissions").select("role_id, permission_id"),
          supabase.from("stores").select("id, organization_id"),
        ]);

      if (cancelled) return;

      const firstError =
        membershipsRes.error ??
        rolesRes.error ??
        permissionsRes.error ??
        rolePermissionsRes.error ??
        storesRes.error;
      if (firstError) {
        console.error("useEntitlements: failed to fetch entitlement rows", firstError);
        // Fail closed: an empty source resolves to no permissions anywhere, never a
        // default-allow — see resolveEntitlements' zero-memberships scenario.
        sessionCache.set(memberId, EMPTY_SOURCE);
        setSource(EMPTY_SOURCE);
        setIsFetching(false);
        return;
      }

      const resolved: EntitlementsSource = {
        memberships: membershipsRes.data ?? [],
        roles: rolesRes.data ?? [],
        permissions: permissionsRes.data ?? [],
        rolePermissions: rolePermissionsRes.data ?? [],
        stores: storesRes.data ?? [],
      };

      sessionCache.set(memberId, resolved);
      setSource(resolved);
      setIsFetching(false);
    }

    fetchAndResolve();

    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const entitlements =
    memberId && source ? resolveEntitlements(memberId, source) : undefined;

  return {
    entitlements,
    isLoading: isMemberLoading || (Boolean(memberId) && !source) || isFetching,
    hasPermission: (permission, scope) =>
      memberId && source
        ? hasPermissionPure(memberId, permission, scope, source)
        : false,
  };
}

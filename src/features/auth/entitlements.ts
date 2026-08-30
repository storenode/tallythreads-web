import { supabase } from "@/lib/supabaseClient";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { CachedEntitlements } from "@/db";
import { cacheEntitlements } from "@/lib/entitlementsCache";

export type Entitlements = Omit<CachedEntitlements, "memberId" | "cached_at">;

interface MembershipRow {
  organization_id: string | null;
  store_id: string | null;
  roles: {
    name: string;
    scope_type: "platform" | "organization" | "store";
    role_permissions: { permissions: { key: string } }[];
  };
}

const log = (...args: unknown[]) => console.log("[entitlements]", ...args);

/** Plain async function — safe to call anywhere, including outside a component
 * (e.g. resolvePostSignInPath.ts). Relies on RLS ("members can read own
 * memberships") rather than filtering by member id client-side. */
export async function fetchEntitlements(): Promise<Entitlements> {
  const { data, error } = await supabase
    .from("memberships")
    .select(
      "organization_id, store_id, roles(name, scope_type, role_permissions(permissions(key)))",
    )
    .is("deleted_at", null)
    .returns<MembershipRow[]>();

  if (error) {
    log("fetch failed:", error);
    throw error;
  }

  const entitlements: Entitlements = {
    platformRole: null,
    organizations: [],
    stores: [],
  };

  for (const row of data ?? []) {
    const permissions = row.roles.role_permissions.map(
      (rp) => rp.permissions.key,
    );
    if (
      row.roles.scope_type === "platform" &&
      row.roles.name === "platform_admin"
    ) {
      entitlements.platformRole = "platform_admin";
    } else if (row.roles.scope_type === "organization" && row.organization_id) {
      entitlements.organizations.push({
        organizationId: row.organization_id,
        role: row.roles.name,
        permissions,
      });
    } else if (row.roles.scope_type === "store" && row.store_id) {
      entitlements.stores.push({
        storeId: row.store_id,
        organizationId: row.organization_id,
        role: row.roles.name,
        permissions,
      });
    }
  }

  log("fetched:", entitlements);
  return entitlements;
}

/** React Query key for one member's entitlements. Shared so callers outside a
 * component (resolvePostSignInPath) can seed the cache the hook then reads. */
export const entitlementsKey = (memberId: string | undefined) =>
  ["auth", "entitlements", memberId] as const;

/** Entitlements change rarely within a session (a role edit is an admin action,
 * not something the signed-in member does mid-flow), so a freshly-seeded value
 * stays authoritative for a while instead of every mounting guard refetching. */
export const ENTITLEMENTS_STALE_TIME = 5 * 60 * 1000;

/**
 * Fetches entitlements once and primes both caches: the React Query cache (so
 * `useEntitlements` downstream is an immediate hit, no second network call right
 * after sign-in) and the Dexie cache (offline/reload durability). Call from the
 * sign-in flow before navigating; see resolvePostSignInPath.ts.
 */
export async function primeEntitlements(
  queryClient: QueryClient,
  memberId: string,
): Promise<Entitlements> {
  const fresh = await fetchEntitlements();
  queryClient.setQueryData(entitlementsKey(memberId), fresh);
  await cacheEntitlements(memberId, fresh);
  return fresh;
}

/** Hook — call only from inside a component. Fetches, then writes through to
 * the Dexie cache on success so the result survives offline/reload. */
export function useEntitlements(memberId: string | undefined) {
  return useQuery({
    queryKey: entitlementsKey(memberId),
    queryFn: async () => {
      const fresh = await fetchEntitlements();
      if (memberId) await cacheEntitlements(memberId, fresh);
      return fresh;
    },
    enabled: !!memberId,
    staleTime: ENTITLEMENTS_STALE_TIME,
  });
}

/** Pure helper, no fetching — checks a permission against an already-fetched
 * Entitlements object. platform_admin always passes, matching is_platform_admin(). */
export function hasPermission(
  entitlements: Entitlements | undefined,
  permission: string,
  scope: { organizationId?: string; storeId?: string } = {},
): boolean {
  if (!entitlements) return false;
  if (entitlements.platformRole === "platform_admin") return true;
  if (scope.organizationId) {
    return entitlements.organizations.some(
      (o) =>
        o.organizationId === scope.organizationId &&
        o.permissions.includes(permission),
    );
  }
  if (scope.storeId) {
    return entitlements.stores.some(
      (s) => s.storeId === scope.storeId && s.permissions.includes(permission),
    );
  }
  return false;
}

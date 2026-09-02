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

  // Cascade: an org-scoped role granting billing.read or inventory.read means that
  // member operates every store in that org — org_owner/org_manager, per
  // M-role-permission-model.md §2 ("operate any store in the org") and §4's matrix —
  // not just stores they separately hold a store-level row on. Without this, someone
  // with zero explicit store_manager/store_sales_staff rows (e.g. a plain org_owner)
  // would never see the Operations area or any store in it, despite the permission
  // matrix already granting them billing/inventory access everywhere in their org.
  // org_accountant is correctly excluded — it has neither permission. This is the
  // client-side mirror of has_store_permission()'s org-cascade branch
  // (supabase/migrations — see that function's own comment); every downstream reader
  // of entitlements.stores (RequireArea, AreaSwitcher, StorePickerPage, StoreSwitcher,
  // RequireStoreAccess, hasPermission below) picks this up for free.
  const cascadeOrgIds = entitlements.organizations
    .filter(
      (o) =>
        o.permissions.includes("billing.read") ||
        o.permissions.includes("inventory.read"),
    )
    .map((o) => o.organizationId);

  if (cascadeOrgIds.length > 0) {
    const { data: cascadeStores, error: cascadeError } = await supabase
      .from("stores")
      .select("id, organization_id")
      .in("organization_id", cascadeOrgIds)
      .is("deleted_at", null);

    if (cascadeError) {
      log("cascade store fetch failed:", cascadeError);
      throw cascadeError;
    }

    const existingStoreIds = new Set(entitlements.stores.map((s) => s.storeId));
    for (const store of cascadeStores ?? []) {
      if (existingStoreIds.has(store.id)) continue;
      const org = entitlements.organizations.find(
        (o) => o.organizationId === store.organization_id,
      );
      if (!org) continue;
      entitlements.stores.push({
        storeId: store.id,
        organizationId: store.organization_id,
        role: org.role,
        permissions: org.permissions,
      });
      existingStoreIds.add(store.id);
    }
  }

  log("fetched:", entitlements);
  log("entitlements <:::> String ", JSON.stringify(entitlements));
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

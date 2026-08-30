import { supabase } from "@/lib/supabaseClient";
import { useQuery } from "@tanstack/react-query";

export interface MyStore {
  id: string;
  name: string;
  store_code: string | null;
  organizationId: string;
  organizationName: string;
}

interface StoreRow {
  id: string;
  name: string;
  store_code: string | null;
  organization_id: string;
  organizations: { name: string } | null;
}

/**
 * Display details for a set of store ids the caller already knows they belong to
 * (from entitlements.stores) — entitlements only carries ids. Deliberately not
 * scoped to "stores in one org": a member can hold store-level access in more than
 * one organization at once (the cross-org staffing case from the business-fit
 * discussion), so this fetches whatever ids are passed in regardless of org.
 * `stores` read is unrestricted for any authenticated member
 * (20260826000000_roles_entitlements_rls_policies.sql); the embedded `organizations`
 * read relies on the new store-membership-based policy
 * (20260830060000_org_read_via_store_membership.sql) so this works even for a
 * member who holds ONLY a store-level row in that org, no org-level one.
 */
export async function fetchMyStores(ids: string[]): Promise<MyStore[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, store_code, organization_id, organizations(name)")
    .in("id", ids)
    .is("deleted_at", null)
    .returns<StoreRow[]>();
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    store_code: row.store_code,
    organizationId: row.organization_id,
    organizationName: row.organizations?.name ?? "—",
  }));
}

export function useMyStores(ids: string[]) {
  const key = ids.slice().sort().join(",");
  return useQuery({
    queryKey: ["operations", "my-stores", key],
    queryFn: () => fetchMyStores(ids),
    enabled: ids.length > 0,
  });
}

import { supabase } from "@/lib/supabaseClient";
import { useQuery } from "@tanstack/react-query";

export interface MyOrganization {
  id: string;
  name: string;
  logo_url: string | null;
}

/**
 * Display details (name, logo) for a set of org ids the caller already knows they
 * belong to (from entitlements.organizations) — entitlements itself only carries
 * ids, not names, so the org picker/switcher need this to render anything a human
 * can choose between. Relies on "members can read their own organizations"
 * (20260826000200_organizations_invites_rls_policies.sql) — every id passed in here
 * is expected to already be one the caller holds an org-level membership in.
 */
export async function fetchMyOrganizations(ids: string[]): Promise<MyOrganization[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, logo_url")
    .in("id", ids)
    .is("deleted_at", null);
  if (error) throw error;
  return data ?? [];
}

export function useMyOrganizations(ids: string[]) {
  const key = ids.slice().sort().join(",");
  return useQuery({
    queryKey: ["org-portal", "my-organizations", key],
    queryFn: () => fetchMyOrganizations(ids),
    enabled: ids.length > 0,
  });
}

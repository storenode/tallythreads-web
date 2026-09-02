import { supabase } from "@/lib/supabaseClient";
import { useQuery } from "@tanstack/react-query";

export interface OrgStore {
  id: string;
  name: string;
  store_code: string | null;
}

/** Every store belonging to one organization — the real /org/:orgId/stores list.
 * Relies on "authenticated can read stores" (unrestricted store read, see
 * myStores.ts's comment) filtered down to this org here client-side via `.eq`. */
export async function fetchStoresByOrg(organizationId: string): Promise<OrgStore[]> {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, store_code")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function useStoresByOrg(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["org-portal", "stores", organizationId],
    queryFn: () => fetchStoresByOrg(organizationId as string),
    enabled: !!organizationId,
  });
}

export interface ArchivedOrgStore extends OrgStore {
  deleted_at: string;
}

/** Archived (soft-deleted) stores for one org — backs the "Show archived stores"
 * section on StoresListPage. This is the only way to reach an archived store's edit
 * page (and its Restore button) through the UI, since fetchStoresByOrg above
 * excludes deleted_at rows entirely. */
export async function fetchArchivedStoresByOrg(
  organizationId: string,
): Promise<ArchivedOrgStore[]> {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, store_code, deleted_at")
    .eq("organization_id", organizationId)
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ArchivedOrgStore[];
}

export function useArchivedStoresByOrg(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["org-portal", "stores", "archived", organizationId],
    queryFn: () => fetchArchivedStoresByOrg(organizationId as string),
    enabled: !!organizationId,
  });
}

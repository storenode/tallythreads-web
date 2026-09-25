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

/** Per-store manager coverage for an org: `{ [storeId]: true }` when that store
 * has at least one active `store_manager` membership. Backs the setup wizard's
 * "every store needs a manager (its owner/in-charge)" go-live gate. */
export async function fetchStoreManagerCoverage(
  organizationId: string,
): Promise<Record<string, boolean>> {
  const { data: stores, error: storesError } = await supabase
    .from("stores")
    .select("id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (storesError) throw storesError;

  const ids = (stores ?? []).map((s) => s.id as string);
  const coverage: Record<string, boolean> = {};
  for (const id of ids) coverage[id] = false;
  if (ids.length === 0) return coverage;

  const { data: rows, error } = await supabase
    .from("memberships")
    .select("store_id, roles(name)")
    .in("store_id", ids)
    .is("deleted_at", null);
  if (error) throw error;

  for (const row of (rows ?? []) as unknown as {
    store_id: string;
    roles: { name: string } | null;
  }[]) {
    if (row.roles?.name === "store_manager") coverage[row.store_id] = true;
  }
  return coverage;
}

export function useStoreManagerCoverage(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["org-portal", "store-manager-coverage", organizationId],
    queryFn: () => fetchStoreManagerCoverage(organizationId as string),
    enabled: !!organizationId,
  });
}

export interface StoreMemberSummary {
  count: number;
  hasManager: boolean;
}

/** Per-store member summary for an org: `{ [storeId]: { count, hasManager } }`.
 * Backs the Go-live review (members-per-store table) and its manager gate. */
export async function fetchStoreMemberSummary(
  organizationId: string,
): Promise<Record<string, StoreMemberSummary>> {
  const { data: stores, error: storesError } = await supabase
    .from("stores")
    .select("id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (storesError) throw storesError;

  const ids = (stores ?? []).map((s) => s.id as string);
  const summary: Record<string, StoreMemberSummary> = {};
  for (const id of ids) summary[id] = { count: 0, hasManager: false };
  if (ids.length === 0) return summary;

  const { data: rows, error } = await supabase
    .from("memberships")
    .select("store_id, roles(name)")
    .in("store_id", ids)
    .is("deleted_at", null);
  if (error) throw error;

  for (const row of (rows ?? []) as unknown as {
    store_id: string;
    roles: { name: string } | null;
  }[]) {
    const s = summary[row.store_id];
    if (!s) continue;
    s.count += 1;
    if (row.roles?.name === "store_manager") s.hasManager = true;
  }
  return summary;
}

export function useStoreMemberSummary(organizationId: string | undefined) {
  return useQuery({
    queryKey: ["org-portal", "store-member-summary", organizationId],
    queryFn: () => fetchStoreMemberSummary(organizationId as string),
    enabled: !!organizationId,
  });
}

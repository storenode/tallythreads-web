import { supabase } from "@/lib/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Franchise linkage data layer — the admin counterpart to organizations.ts /
 * storesAdmin.ts, for the platform-admin "Franchise" card on the org edit page.
 *
 * All writes are direct table calls gated by the `is_platform_admin()` RLS policies
 * on franchise_groups / franchise_memberships (20260827000000_m1c_franchise_linkage).
 * A store only actually counts as "franchise" once a franchise_membership links it to
 * a group — the store_business_model view derives it from that row, not from a label.
 */

export interface FranchiseGroup {
  id: string;
  franchisor_org_id: string;
  name: string;
  created_at: string;
  deleted_at: string | null;
}

export interface FranchiseMembership {
  id: string;
  store_id: string;
  franchise_group_id: string;
  agreement_start: string;
  agreement_end: string | null;
  deleted_at: string | null;
}

// Keyed by the franchisor org, since the card is always org-scoped.
const franchiseKey = (orgId: string | undefined) =>
  ["admin", "franchise", orgId] as const;

// --- Plain async functions ---

export async function fetchFranchiseGroupByOrg(
  orgId: string,
): Promise<FranchiseGroup | null> {
  const { data, error } = await supabase
    .from("franchise_groups")
    .select("*")
    .eq("franchisor_org_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createFranchiseGroup(
  orgId: string,
  name: string,
): Promise<FranchiseGroup> {
  const { data, error } = await supabase
    .from("franchise_groups")
    .insert({ franchisor_org_id: orgId, name: name.trim() })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchFranchiseMemberships(
  groupId: string,
): Promise<FranchiseMembership[]> {
  const { data, error } = await supabase
    .from("franchise_memberships")
    .select("*")
    .eq("franchise_group_id", groupId)
    .is("deleted_at", null);
  if (error) throw error;
  return data ?? [];
}

export async function linkStoreToFranchise(
  storeId: string,
  groupId: string,
  agreementStart: string,
  agreementEnd: string | null,
): Promise<FranchiseMembership> {
  const { data, error } = await supabase
    .from("franchise_memberships")
    .insert({
      store_id: storeId,
      franchise_group_id: groupId,
      agreement_start: agreementStart,
      agreement_end: agreementEnd,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateFranchiseMembership(
  id: string,
  patch: { agreement_start?: string; agreement_end?: string | null },
): Promise<FranchiseMembership> {
  const { data, error } = await supabase
    .from("franchise_memberships")
    .update({ ...patch, last_modified_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function unlinkStore(membershipId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("franchise_memberships")
    .update({ deleted_at: now, last_modified_at: now })
    .eq("id", membershipId);
  if (error) throw error;
}

// --- Hooks ---

export function useFranchiseGroupByOrg(orgId: string | undefined) {
  return useQuery({
    queryKey: [...franchiseKey(orgId), "group"],
    queryFn: () => fetchFranchiseGroupByOrg(orgId!),
    enabled: !!orgId,
  });
}

export function useFranchiseMemberships(
  orgId: string | undefined,
  groupId: string | undefined,
) {
  return useQuery({
    queryKey: [...franchiseKey(orgId), "memberships", groupId],
    queryFn: () => fetchFranchiseMemberships(groupId!),
    enabled: !!groupId,
  });
}

export function useCreateFranchiseGroup(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createFranchiseGroup(orgId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: franchiseKey(orgId) });
    },
  });
}

export function useLinkStoreToFranchise(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      storeId: string;
      groupId: string;
      agreementStart: string;
      agreementEnd: string | null;
    }) =>
      linkStoreToFranchise(
        input.storeId,
        input.groupId,
        input.agreementStart,
        input.agreementEnd,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: franchiseKey(orgId) });
    },
  });
}

export function useUpdateFranchiseMembership(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      patch: { agreement_start?: string; agreement_end?: string | null };
    }) => updateFranchiseMembership(input.id, input.patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: franchiseKey(orgId) });
    },
  });
}

export function useUnlinkStore(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: string) => unlinkStore(membershipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: franchiseKey(orgId) });
    },
  });
}

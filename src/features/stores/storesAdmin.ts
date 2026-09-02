import { supabase } from "@/lib/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  memberProfileRpcParams,
  type InviteMemberResult,
  type MemberProfileFields,
} from "@/components/forms/member/types";

const s2 = (v: string | null | undefined) => v ?? "";
const n = (v: string) => v.trim() || null;

/**
 * Stores CRUD + members data layer — the store counterpart of
 * features/admin/organizations/organizations.ts, mirroring its shape function for
 * function (fetch/update/archive/hard-delete/members/invite) rather than trying to
 * generalize both into one shared module. Store creation is deliberately a plain
 * client insert (not a security-definer RPC like organizations' provision_*): the
 * 2026-08-30 scoping decision kept store creation minimal (name + code only, no
 * invites at creation time), so there's no multi-table transaction to protect —
 * the existing "platform admins or org.store.create members can insert stores" RLS
 * policy is the entire authorization story.
 */

export interface Store {
  id: string;
  organization_id: string;
  name: string;
  store_code: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  phone_number: string | null;
  email: string | null;
  gstin: string | null;
  opening_time: string | null;
  closing_time: string | null;
  created_at: string;
  last_modified_at: string;
  deleted_at: string | null;
}

export interface CreateStoreInput {
  name: string;
  store_code: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  phone_number: string;
  email: string;
  gstin: string;
  opening_time: string;
  closing_time: string;
}

export interface UpdateStoreInput {
  name?: string;
  store_code?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  phone_number?: string | null;
  email?: string | null;
  gstin?: string | null;
  opening_time?: string | null;
  closing_time?: string | null;
}

const STORES_KEY = ["org-portal", "stores"] as const;

// --- Plain async functions — safe to call outside a component too. ---

export async function fetchStore(id: string): Promise<Store> {
  const { data, error } = await supabase
    .from("stores")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createStore(
  organizationId: string,
  input: CreateStoreInput,
): Promise<Store> {
  const { data, error } = await supabase
    .from("stores")
    .insert({
      organization_id: organizationId,
      name: input.name.trim(),
      store_code: n(input.store_code),
      address_line1: n(input.address_line1),
      address_line2: n(input.address_line2),
      city: n(input.city),
      state: n(input.state),
      pincode: n(input.pincode),
      country: n(input.country),
      phone_number: n(input.phone_number),
      email: n(input.email),
      gstin: n(input.gstin),
      opening_time: n(input.opening_time),
      closing_time: n(input.closing_time),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateStore(
  id: string,
  patch: UpdateStoreInput,
): Promise<Store> {
  const { data, error } = await supabase
    .from("stores")
    .update({ ...patch, last_modified_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Soft-deletes a store via the archive_store() RPC — platform_admin or store.delete
 * (org_owner) only, NOT store.edit, unlike the rest of the stores UPDATE surface. A
 * raw client update can no longer touch deleted_at at all (see the stores UPDATE
 * RLS's WITH CHECK), so this RPC is the only path now. */
export async function archiveStore(id: string): Promise<void> {
  const { error } = await supabase.rpc("archive_store", { store_id: id });
  if (error) throw error;
}

/** Un-archives a store via restore_store() — same store.delete/platform_admin gate
 * as archiveStore(). */
export async function restoreStore(id: string): Promise<void> {
  const { error } = await supabase.rpc("restore_store", { store_id: id });
  if (error) throw error;
}

export interface HardDeleteStoreSummary {
  store_name: string;
  channels_deleted: number;
  franchise_memberships_deleted: number;
  store_invitations_deleted: number;
  memberships_deleted: number;
  access_grants_deleted: number;
}

export async function hardDeleteStore(
  id: string,
): Promise<HardDeleteStoreSummary> {
  const { data, error } = await supabase.rpc("hard_delete_store", {
    store_id: id,
  });
  if (error) throw error;
  return data as HardDeleteStoreSummary;
}

export interface StoreMemberRow {
  membershipId: string;
  memberId: string;
  roleName: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  joinedAt: string;
}

interface RawStoreMembershipRow {
  id: string;
  member_id: string;
  created_at: string;
  roles: { name: string } | null;
  members: {
    google_email: string;
    first_name: string | null;
    last_name: string | null;
    is_active: boolean;
  } | null;
}

export async function fetchStoreMembers(
  storeId: string,
): Promise<StoreMemberRow[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select(
      "id, member_id, created_at, roles(name), members(google_email, first_name, last_name, is_active)",
    )
    .eq("store_id", storeId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as RawStoreMembershipRow[]).map((row) => ({
    membershipId: row.id,
    memberId: row.member_id,
    roleName: row.roles?.name ?? "—",
    email: row.members?.google_email ?? "",
    firstName: row.members?.first_name ?? null,
    lastName: row.members?.last_name ?? null,
    isActive: row.members?.is_active ?? false,
    joinedAt: row.created_at,
  }));
}

export async function revokeStoreMember(membershipId: string): Promise<void> {
  const { error } = await supabase
    .from("memberships")
    .update({
      deleted_at: new Date().toISOString(),
      last_modified_at: new Date().toISOString(),
    })
    .eq("id", membershipId);
  if (error) throw error;
}

export interface StoreMemberDetail extends MemberProfileFields {
  memberId: string;
  membershipId: string;
  roleName: string;
  email: string;
}

interface RawStoreMemberDetailRow {
  id: string;
  member_id: string;
  roles: { name: string } | null;
  members: {
    google_email: string;
    first_name: string | null;
    last_name: string | null;
    mobile_number: string | null;
    aadhaar_number: string | null;
    pan_number: string | null;
    date_of_joining: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    pincode: string | null;
  } | null;
}

/** One member's full profile + their role at this store — backs the "edit member"
 * page's pre-fill. Relies on the staff.invite-gated store member-read RLS
 * (20260831090000_store_scoped_member_read_rls.sql). */
export async function fetchStoreMemberDetail(
  storeId: string,
  memberId: string,
): Promise<StoreMemberDetail> {
  const { data, error } = await supabase
    .from("memberships")
    .select(
      "id, member_id, roles(name), members(google_email, first_name, last_name, mobile_number, aadhaar_number, pan_number, date_of_joining, emergency_contact_name, emergency_contact_phone, address_line1, address_line2, city, state, pincode)",
    )
    .eq("store_id", storeId)
    .eq("member_id", memberId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;

  const row = data as unknown as RawStoreMemberDetailRow;
  const m = row.members;
  return {
    memberId: row.member_id,
    membershipId: row.id,
    roleName: row.roles?.name ?? "",
    email: m?.google_email ?? "",
    firstName: s2(m?.first_name),
    lastName: s2(m?.last_name),
    mobileNumber: s2(m?.mobile_number),
    aadhaarNumber: s2(m?.aadhaar_number),
    panNumber: s2(m?.pan_number),
    dateOfJoining: s2(m?.date_of_joining),
    emergencyContactName: s2(m?.emergency_contact_name),
    emergencyContactPhone: s2(m?.emergency_contact_phone),
    addressLine1: s2(m?.address_line1),
    addressLine2: s2(m?.address_line2),
    city: s2(m?.city),
    state: s2(m?.state),
    pincode: s2(m?.pincode),
  };
}

/** Overwrites (not backfills) an existing store member's profile fields. Does not
 * touch email or role. */
export async function updateStoreMemberProfile(
  storeId: string,
  memberId: string,
  input: MemberProfileFields,
): Promise<void> {
  const { error } = await supabase.rpc("update_member_profile", {
    target_member_id: memberId,
    target_store_id: storeId,
    ...memberProfileRpcParams(input),
  });
  if (error) throw error;
}

export interface InviteStoreMemberInput extends MemberProfileFields {
  email: string;
  role_name: string;
}

export type InviteStoreMemberResult = InviteMemberResult;

export async function inviteStoreMember(
  storeId: string,
  input: InviteStoreMemberInput,
): Promise<InviteStoreMemberResult> {
  const { data, error } = await supabase.rpc("invite_store_member", {
    target_store_id: storeId,
    invite_email: input.email,
    invite_role_name: input.role_name,
    ...memberProfileRpcParams(input),
  });
  if (error) throw error;
  return data as InviteStoreMemberResult;
}

// --- Hooks — call only from inside a component. ---

export function useStore(id: string | undefined) {
  return useQuery({
    queryKey: [...STORES_KEY, "detail", id],
    queryFn: () => fetchStore(id!),
    enabled: !!id,
  });
}

export function useCreateStore(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStoreInput) =>
      createStore(organizationId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...STORES_KEY, organizationId] });
    },
  });
}

export function useUpdateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateStoreInput }) =>
      updateStore(id, patch),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [...STORES_KEY, data.organization_id] });
      queryClient.setQueryData([...STORES_KEY, "detail", data.id], data);
    },
  });
}

export function useArchiveStore(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: archiveStore,
    onSuccess: () => {
      // Broad invalidation (not just [...STORES_KEY, organizationId]) — archiving
      // also has to refresh the archived-stores list (stores.ts) and this store's
      // own detail query, both of which nest under the same STORES_KEY prefix.
      queryClient.invalidateQueries({ queryKey: STORES_KEY });
      queryClient.invalidateQueries({ queryKey: [...STORES_KEY, organizationId] });
    },
  });
}

export function useRestoreStore(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: restoreStore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STORES_KEY });
      queryClient.invalidateQueries({ queryKey: [...STORES_KEY, organizationId] });
    },
  });
}

export function useHardDeleteStore(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: hardDeleteStore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...STORES_KEY, organizationId] });
    },
  });
}

function storeMembersKey(storeId: string | undefined) {
  return [...STORES_KEY, "detail", storeId, "members"] as const;
}

export function useStoreMembers(storeId: string | undefined) {
  return useQuery({
    queryKey: storeMembersKey(storeId),
    queryFn: () => fetchStoreMembers(storeId!),
    enabled: !!storeId,
  });
}

export function useRevokeStoreMember(storeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeStoreMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storeMembersKey(storeId) });
    },
  });
}

export function useInviteStoreMember(storeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteStoreMemberInput) =>
      inviteStoreMember(storeId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: storeMembersKey(storeId) });
    },
  });
}

function storeMemberDetailKey(
  storeId: string | undefined,
  memberId: string | undefined,
) {
  return [...storeMembersKey(storeId), "detail", memberId] as const;
}

export function useStoreMemberDetail(
  storeId: string | undefined,
  memberId: string | undefined,
) {
  return useQuery({
    queryKey: storeMemberDetailKey(storeId, memberId),
    queryFn: () => fetchStoreMemberDetail(storeId!, memberId!),
    enabled: !!storeId && !!memberId,
  });
}

export function useUpdateStoreMemberProfile(storeId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      memberId,
      input,
    }: {
      memberId: string;
      input: MemberProfileFields;
    }) => updateStoreMemberProfile(storeId!, memberId, input),
    onSuccess: (_void, { memberId }) => {
      queryClient.invalidateQueries({ queryKey: storeMembersKey(storeId) });
      queryClient.invalidateQueries({
        queryKey: storeMemberDetailKey(storeId, memberId),
      });
    },
  });
}

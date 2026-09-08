import { supabase } from "@/lib/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  memberProfileRpcParams,
  type InviteMemberResult,
  type MemberProfileFields,
} from "@/components/forms/member/types";

export type RegistrationType = "independent" | "chain" | "franchise";
export type LegalEntityType =
  | "proprietorship"
  | "partnership"
  | "llp"
  | "private_limited"
  | "huf"
  | "other";
export type OrganizationStatus = "trial" | "active" | "suspended" | "churned";

export interface Organization {
  id: string;
  name: string;
  registration_type: RegistrationType | null;
  legal_name: string | null;
  legal_entity_type: LegalEntityType | null;
  gstin: string | null;
  pan: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  primary_contact_phone: string | null;
  primary_contact_member_id: string | null;
  website: string | null;
  logo_url: string | null;
  financial_year_start_month: number | null;
  preferred_language: string | null;
  status: OrganizationStatus;
  onboarded_by: string | null;
  notes: string | null;
  is_demo: boolean;
  created_at: string;
  last_modified_at: string;
  deleted_at: string | null;
}

export interface OrganizationInvite {
  email: string;
  role_name: "org_owner" | "org_manager" | "org_accountant";
  is_primary_contact: boolean;
}

export interface CreateOrganizationInput {
  name: string;
  registration_type: RegistrationType;
  is_demo: boolean;
  invites: OrganizationInvite[];
}

export type UpdateOrganizationInput = Partial<
  Omit<Organization, "id" | "created_at" | "last_modified_at" | "deleted_at">
>;

const ORGANIZATIONS_KEY = ["admin", "organizations"] as const;

// --- Plain async functions — safe to call outside a component too. ---

export async function fetchOrganizations(): Promise<Organization[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchOrganization(id: string): Promise<Organization> {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<Organization> {
  const { data, error } = await supabase.rpc(
    "provision_organization_with_contacts",
    {
      org_name: input.name,
      org_registration_type: input.registration_type,
      org_is_demo: input.is_demo,
      invites: input.invites,
    },
  );
  if (error) throw error;
  return data;
}

export async function updateOrganization(
  id: string,
  patch: UpdateOrganizationInput,
): Promise<Organization> {
  const { data, error } = await supabase
    .from("organizations")
    .update({ ...patch, last_modified_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archiveOrganization(id: string): Promise<void> {
  const { error } = await supabase
    .from("organizations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export interface HardDeleteSummary {
  organization_name: string;
  stores_deleted: number;
  channels_deleted: number;
  memberships_deleted: number;
  store_invitations_deleted: number;
  access_grants_deleted: number;
  franchise_groups_deleted: number;
  franchise_memberships_deleted: number;
  settlement_rules_deleted: number;
  demo_scenarios_deleted: number;
}

export async function hardDeleteOrganization(
  id: string,
): Promise<HardDeleteSummary> {
  const { data, error } = await supabase.rpc("hard_delete_organization", {
    org_id: id,
  });
  if (error) throw error;

  // Best-effort cleanup: the organizations row (and its logo_url) is already
  // gone by the time we get here, so a failure below just leaves an orphaned
  // file in storage — not a broken app state, so it isn't worth failing the
  // whole delete over.
  try {
    const { data: files } = await supabase.storage.from("org-logos").list(id);
    if (files && files.length > 0) {
      await supabase.storage
        .from("org-logos")
        .remove(files.map((f) => `${id}/${f.name}`));
    }
  } catch {
    // Ignore — see comment above.
  }

  return data as HardDeleteSummary;
}

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB
const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Stores exactly one image per `key` (an org id or a store id) inside `bucket`,
 * as `{key}/logo.{ext}`. Because the extension is derived from the file's MIME
 * type, replacing a PNG with a JPEG would otherwise leave the old object behind —
 * so every sibling under `{key}/` that isn't the file we just wrote is deleted,
 * keeping a strict 1:1 mapping between the entity and its stored image.
 *
 * Returns a cache-busted public URL (same path is reused on every replace, so the
 * browser/CDN would keep serving the previous image without the `?v=` suffix).
 */
async function putEntityLogo(
  bucket: string,
  key: string,
  file: File,
): Promise<string> {
  const ext = MIME_EXT[file.type];
  if (!ext) {
    throw new Error("Logo must be a PNG, JPEG, or WebP image.");
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error("Logo must be under 2MB.");
  }

  const filename = `logo.${ext}`;
  const path = `${key}/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (uploadError) throw uploadError;

  // Enforce one-to-one: drop any other object under this key (e.g. a stale
  // logo.png left over after switching to logo.webp).
  const { data: siblings } = await supabase.storage.from(bucket).list(key);
  const stale = (siblings ?? [])
    .filter((f) => f.name !== filename)
    .map((f) => `${key}/${f.name}`);
  if (stale.length > 0) {
    await supabase.storage.from(bucket).remove(stale);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Deletes every stored image for `key` in `bucket` (the whole `{key}/` folder). */
async function clearEntityLogo(bucket: string, key: string): Promise<void> {
  const { data: files } = await supabase.storage.from(bucket).list(key);
  const paths = (files ?? []).map((f) => `${key}/${f.name}`);
  if (paths.length > 0) {
    await supabase.storage.from(bucket).remove(paths);
  }
}

export async function uploadOrganizationLogo(
  orgId: string,
  file: File,
): Promise<string> {
  const publicUrl = await putEntityLogo("org-logos", orgId, file);

  const { error: updateError } = await supabase
    .from("organizations")
    .update({ logo_url: publicUrl, last_modified_at: new Date().toISOString() })
    .eq("id", orgId);
  if (updateError) throw updateError;

  return publicUrl;
}

export async function removeOrganizationLogo(orgId: string): Promise<void> {
  await clearEntityLogo("org-logos", orgId);

  const { error } = await supabase
    .from("organizations")
    .update({ logo_url: null, last_modified_at: new Date().toISOString() })
    .eq("id", orgId);
  if (error) throw error;
}

/**
 * Store counterpart of {@link uploadOrganizationLogo} — same 1:1 guarantee, in
 * the `store-logos` bucket. The DB write is intentionally left to the caller (the
 * stores module owns its own column/hook); this only manages the stored file.
 */
export async function uploadStoreLogo(
  storeId: string,
  file: File,
): Promise<string> {
  return putEntityLogo("store-logos", storeId, file);
}

export async function removeStoreLogo(storeId: string): Promise<void> {
  await clearEntityLogo("store-logos", storeId);
}

export interface OrgMemberRow {
  membershipId: string;
  memberId: string;
  roleName: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  joinedAt: string;
}

// supabase-js's nested-select shape isn't in generated types here (no codegen set up
// for this project yet), so this is hand-typed to match the actual query below.
interface RawMembershipRow {
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

export async function fetchOrganizationMembers(
  orgId: string,
): Promise<OrgMemberRow[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select(
      "id, member_id, created_at, roles(name), members(google_email, first_name, last_name, is_active)",
    )
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as RawMembershipRow[]).map((row) => ({
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

export async function revokeOrganizationMember(
  membershipId: string,
): Promise<void> {
  const { error } = await supabase
    .from("memberships")
    .update({
      deleted_at: new Date().toISOString(),
      last_modified_at: new Date().toISOString(),
    })
    .eq("id", membershipId);
  if (error) throw error;
}

export interface OrgMemberDetail extends MemberProfileFields {
  memberId: string;
  membershipId: string;
  roleName: string;
  email: string;
}

interface RawOrgMemberDetailRow {
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

const s2 = (v: string | null | undefined) => v ?? "";

/** One member's full profile + their role in this org — backs the "edit member"
 * page's pre-fill. Relies on the same RLS that lets the Members card read fellow
 * members (org.manage_members, 20260831020000_org_manage_members_read_members.sql). */
export async function fetchOrgMemberDetail(
  orgId: string,
  memberId: string,
): Promise<OrgMemberDetail> {
  const { data, error } = await supabase
    .from("memberships")
    .select(
      "id, member_id, roles(name), members(google_email, first_name, last_name, mobile_number, aadhaar_number, pan_number, date_of_joining, emergency_contact_name, emergency_contact_phone, address_line1, address_line2, city, state, pincode)",
    )
    .eq("organization_id", orgId)
    .eq("member_id", memberId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;

  const row = data as unknown as RawOrgMemberDetailRow;
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

/** Overwrites (not backfills — see update_member_profile()'s own comment) an
 * existing member's profile fields. Does not touch email or role. */
export async function updateOrgMemberProfile(
  orgId: string,
  memberId: string,
  input: MemberProfileFields,
): Promise<void> {
  const { error } = await supabase.rpc("update_member_profile", {
    target_member_id: memberId,
    target_org_id: orgId,
    ...memberProfileRpcParams(input),
  });
  if (error) throw error;
}

export interface InviteOrgMemberInput extends MemberProfileFields {
  email: string;
  role_name: "org_owner" | "org_manager" | "org_accountant";
  is_primary_contact: boolean;
}

export type InviteOrgMemberResult = InviteMemberResult;

export async function inviteOrganizationMember(
  orgId: string,
  input: InviteOrgMemberInput,
): Promise<InviteOrgMemberResult> {
  const { data, error } = await supabase.rpc("invite_organization_member", {
    target_org_id: orgId,
    invite_email: input.email,
    invite_role_name: input.role_name,
    invite_is_primary_contact: input.is_primary_contact,
    ...memberProfileRpcParams(input),
  });
  if (error) throw error;
  return data as InviteOrgMemberResult;
}

// --- Hooks — call only from inside a component. ---

export function useOrganizations() {
  return useQuery({
    queryKey: ORGANIZATIONS_KEY,
    queryFn: fetchOrganizations,
  });
}

export function useOrganization(id: string | undefined) {
  return useQuery({
    queryKey: [...ORGANIZATIONS_KEY, id],
    queryFn: () => fetchOrganization(id!),
    enabled: !!id,
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_KEY });
    },
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateOrganizationInput;
    }) => updateOrganization(id, patch),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_KEY });
      queryClient.setQueryData([...ORGANIZATIONS_KEY, data.id], data);
    },
  });
}

export function useArchiveOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: archiveOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_KEY });
    },
  });
}

export function useHardDeleteOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: hardDeleteOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_KEY });
    },
  });
}

export function useUploadOrganizationLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, file }: { orgId: string; file: File }) =>
      uploadOrganizationLogo(orgId, file),
    onSuccess: (logoUrl, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_KEY });
      queryClient.setQueryData(
        [...ORGANIZATIONS_KEY, orgId],
        (prev: Organization | undefined) =>
          prev && { ...prev, logo_url: logoUrl },
      );
    },
  });
}

export function useRemoveOrganizationLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (orgId: string) => removeOrganizationLogo(orgId),
    onSuccess: (_void, orgId) => {
      queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_KEY });
      queryClient.setQueryData(
        [...ORGANIZATIONS_KEY, orgId],
        (prev: Organization | undefined) =>
          prev && { ...prev, logo_url: null },
      );
    },
  });
}

function orgMembersKey(orgId: string | undefined) {
  return [...ORGANIZATIONS_KEY, orgId, "members"] as const;
}

export function useOrganizationMembers(orgId: string | undefined) {
  return useQuery({
    queryKey: orgMembersKey(orgId),
    queryFn: () => fetchOrganizationMembers(orgId!),
    enabled: !!orgId,
  });
}

export interface OrgPurchaseTripRow {
  id: string;
  title: string;
  status: "planning" | "active" | "completed";
  startDate: string | null;
  endDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  plannedBudgetPaise: number | null;
}

export async function fetchOrganizationPurchaseTrips(
  orgId: string,
): Promise<OrgPurchaseTripRow[]> {
  const { data, error } = await supabase
    .from("purchase_trips")
    .select(
      "id, title, status, start_date, end_date, started_at, completed_at, planned_budget_paise",
    )
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("last_modified_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: (row.title as string) ?? "Untitled trip",
    status: row.status as OrgPurchaseTripRow["status"],
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    plannedBudgetPaise: (row.planned_budget_paise as number | null) ?? null,
  }));
}

function orgTripsKey(orgId: string | undefined) {
  return [...ORGANIZATIONS_KEY, orgId, "purchase-trips"] as const;
}

export function useOrganizationPurchaseTrips(orgId: string | undefined) {
  return useQuery({
    queryKey: orgTripsKey(orgId),
    queryFn: () => fetchOrganizationPurchaseTrips(orgId!),
    enabled: !!orgId,
  });
}

export function useRevokeOrganizationMember(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeOrganizationMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgMembersKey(orgId) });
    },
  });
}

export function useInviteOrganizationMember(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteOrgMemberInput) =>
      inviteOrganizationMember(orgId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgMembersKey(orgId) });
      // A new invite can also have set primary_contact_member_id, so the org row
      // itself (and the list's stats, if it ever shows member counts) may be stale too.
      queryClient.invalidateQueries({
        queryKey: [...ORGANIZATIONS_KEY, orgId],
      });
      queryClient.invalidateQueries({ queryKey: ORGANIZATIONS_KEY });
    },
  });
}

function orgMemberDetailKey(
  orgId: string | undefined,
  memberId: string | undefined,
) {
  return [...orgMembersKey(orgId), "detail", memberId] as const;
}

export function useOrgMemberDetail(
  orgId: string | undefined,
  memberId: string | undefined,
) {
  return useQuery({
    queryKey: orgMemberDetailKey(orgId, memberId),
    queryFn: () => fetchOrgMemberDetail(orgId!, memberId!),
    enabled: !!orgId && !!memberId,
  });
}

export function useUpdateOrgMemberProfile(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      memberId,
      input,
    }: {
      memberId: string;
      input: MemberProfileFields;
    }) => updateOrgMemberProfile(orgId!, memberId, input),
    onSuccess: (_void, { memberId }) => {
      queryClient.invalidateQueries({ queryKey: orgMembersKey(orgId) });
      queryClient.invalidateQueries({
        queryKey: orgMemberDetailKey(orgId, memberId),
      });
    },
  });
}

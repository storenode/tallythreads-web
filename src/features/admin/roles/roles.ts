import { supabase } from "@/lib/supabaseClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type RoleScope = "platform" | "organization" | "store";

export interface Role {
  id: string;
  name: string;
  scope_type: RoleScope;
  is_system: boolean;
}

export interface Permission {
  id: string;
  key: string;
  module: string;
  is_system: boolean;
}

export interface RolePermissionGrant {
  role_id: string;
  permission_id: string;
}

export interface CreateRoleInput {
  name: string;
  scope_type: RoleScope;
}

export interface CreatePermissionInput {
  key: string;
  module: string;
}

// Customer-facing labels for the seeded (is_system) roles — shown in place of the
// raw snake_case `name` anywhere staff/admins pick or view a role (Roles & Permissions
// table, the org member-invite dropdown, etc). Custom roles created through the admin
// UI have no entry here and fall back to their raw name — see roleDisplayName().
export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  platform_admin: "Platform Admin",
  platform_editor: "Content Editor",
  platform_content_lead: "Content Lead",
  org_owner: "Owner",
  org_manager: "Operations Manager",
  org_accountant: "Accountant",
  store_manager: "Store Manager",
  store_sales_staff: "Sales Staff / Biller",
  store_temp_staff: "Seasonal Staff",
  store_cleaning_staff: "Cleaning Staff",
};

export function roleDisplayName(name: string): string {
  return ROLE_DISPLAY_NAMES[name] ?? name;
}

const ROLES_KEY = ["admin", "roles"] as const;
const PERMISSIONS_KEY = ["admin", "permissions"] as const;
const GRANTS_KEY = ["admin", "role-permissions"] as const;

// --- Plain async functions — safe to call outside a component too. ---

export async function fetchRoles(): Promise<Role[]> {
  const { data, error } = await supabase
    .from("roles")
    .select("id, name, scope_type, is_system")
    .order("scope_type", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchPermissions(): Promise<Permission[]> {
  const { data, error } = await supabase
    .from("permissions")
    .select("id, key, module, is_system")
    .order("module", { ascending: true })
    .order("key", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchRolePermissionGrants(): Promise<RolePermissionGrant[]> {
  const { data, error } = await supabase
    .from("role_permissions")
    .select("role_id, permission_id");
  if (error) throw error;
  return data ?? [];
}

export async function createRole(input: CreateRoleInput): Promise<Role> {
  const { data, error } = await supabase
    .from("roles")
    .insert({ name: input.name.trim(), scope_type: input.scope_type })
    .select("id, name, scope_type, is_system")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRole(id: string): Promise<void> {
  const { error } = await supabase.from("roles").delete().eq("id", id);
  if (error) throw error;
}

export async function createPermission(
  input: CreatePermissionInput,
): Promise<Permission> {
  const { data, error } = await supabase
    .from("permissions")
    .insert({ key: input.key.trim(), module: input.module.trim() })
    .select("id, key, module, is_system")
    .single();
  if (error) throw error;
  return data;
}

export async function deletePermission(id: string): Promise<void> {
  const { error } = await supabase.from("permissions").delete().eq("id", id);
  if (error) throw error;
}

export async function grantRolePermission(
  roleId: string,
  permissionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("role_permissions")
    .insert({ role_id: roleId, permission_id: permissionId });
  if (error) throw error;
}

export async function revokeRolePermission(
  roleId: string,
  permissionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId)
    .eq("permission_id", permissionId);
  if (error) throw error;
}

// --- Hooks — call only from inside a component. ---

export function useRoles() {
  return useQuery({ queryKey: ROLES_KEY, queryFn: fetchRoles });
}

export function usePermissions() {
  return useQuery({ queryKey: PERMISSIONS_KEY, queryFn: fetchPermissions });
}

export function useRolePermissionGrants() {
  return useQuery({ queryKey: GRANTS_KEY, queryFn: fetchRolePermissionGrants });
}

export function useCreateRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ROLES_KEY });
      queryClient.invalidateQueries({ queryKey: GRANTS_KEY });
    },
  });
}

export function useCreatePermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPermission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY });
    },
  });
}

export function useDeletePermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePermission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY });
      queryClient.invalidateQueries({ queryKey: GRANTS_KEY });
    },
  });
}

export function useSetRolePermission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      roleId,
      permissionId,
      granted,
    }: {
      roleId: string;
      permissionId: string;
      granted: boolean;
    }) =>
      granted
        ? grantRolePermission(roleId, permissionId)
        : revokeRolePermission(roleId, permissionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GRANTS_KEY });
    },
  });
}

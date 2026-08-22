/**
 * M1b §4 — the single function every mutating Edge Function and the client both call
 * to answer "what can this member do." Pure and synchronous: it takes already-fetched
 * rows (the shape of `roles`/`permissions`/`role_permissions`/`memberships`/`stores`)
 * rather than a DB client, so it can be unit-tested without mocking Supabase — the
 * same reasoning that keeps gstCalc.ts pure. A thin async wrapper that fetches these
 * rows and calls in belongs to whatever calls this (client hook / Edge Function), not
 * here — that keeps the security-critical logic itself free of I/O and easy to audit.
 */

export interface RoleRecord {
  id: string;
  name: string;
  scope_type: "platform" | "organization" | "store";
}

export interface PermissionRecord {
  id: string;
  key: string;
}

export interface RolePermissionRecord {
  role_id: string;
  permission_id: string;
}

export interface MembershipRecord {
  id: string;
  member_id: string;
  role_id: string;
  organization_id: string | null;
  store_id: string | null;
  deleted_at: string | null;
}

export interface StoreRecord {
  id: string;
  organization_id: string;
}

export interface EntitlementsSource {
  memberships: MembershipRecord[];
  roles: RoleRecord[];
  permissions: PermissionRecord[];
  rolePermissions: RolePermissionRecord[];
  stores: StoreRecord[];
}

export interface OrganizationEntitlement {
  organizationId: string;
  role: "org_owner" | "org_manager" | "org_accountant";
}

export interface StoreEntitlement {
  storeId: string;
  role: string;
  via: "direct" | "org_cascade";
}

export interface Entitlements {
  platformRole: "platform_admin" | null;
  organizations: OrganizationEntitlement[];
  stores: StoreEntitlement[];
}

export interface PermissionScope {
  organizationId?: string;
  storeId?: string;
}

export function resolveEntitlements(
  memberId: string,
  source: EntitlementsSource,
): Entitlements {
  const activeMemberships = source.memberships.filter(
    (m) => m.member_id === memberId && m.deleted_at === null,
  );

  const withRole = activeMemberships.map((membership) => ({
    membership,
    role: source.roles.find((r) => r.id === membership.role_id) ?? null,
  }));

  const platformRole = withRole.some(
    ({ role }) => role?.scope_type === "platform" && role.name === "platform_admin",
  )
    ? ("platform_admin" as const)
    : null;

  const organizations: OrganizationEntitlement[] = withRole
    .filter(
      ({ role, membership }) =>
        role?.scope_type === "organization" && membership.organization_id !== null,
    )
    .map(({ role, membership }) => ({
      organizationId: membership.organization_id as string,
      role: role!.name as OrganizationEntitlement["role"],
    }));

  const directStores: StoreEntitlement[] = withRole
    .filter(
      ({ role, membership }) =>
        role?.scope_type === "store" && membership.store_id !== null,
    )
    .map(({ role, membership }) => ({
      storeId: membership.store_id as string,
      role: role!.name,
      via: "direct" as const,
    }));

  const cascadedStores: StoreEntitlement[] = organizations.flatMap((org) =>
    source.stores
      .filter((store) => store.organization_id === org.organizationId)
      .map((store) => ({ storeId: store.id, role: org.role, via: "org_cascade" as const })),
  );

  return {
    platformRole,
    organizations,
    // A store reached both directly and via cascade keeps its direct entry — the more
    // specific grant — rather than being listed twice.
    stores: [
      ...directStores,
      ...cascadedStores.filter(
        (cascaded) => !directStores.some((d) => d.storeId === cascaded.storeId),
      ),
    ],
  };
}

function roleGrantsPermission(
  source: EntitlementsSource,
  roleName: string,
  permissionKey: string,
): boolean {
  const role = source.roles.find((r) => r.name === roleName);
  const permission = source.permissions.find((p) => p.key === permissionKey);
  if (!role || !permission) return false;
  return source.rolePermissions.some(
    (rp) => rp.role_id === role.id && rp.permission_id === permission.id,
  );
}

export function hasPermission(
  memberId: string,
  permission: string,
  scope: PermissionScope,
  source: EntitlementsSource,
): boolean {
  const entitlements = resolveEntitlements(memberId, source);

  // platform_admin is authoritative at every scope, including one it has no prior
  // org/store relationship with — resolveEntitlements deliberately doesn't try to
  // enumerate every org/store in the system for it, so this check is scope-agnostic.
  if (entitlements.platformRole === "platform_admin") return true;

  if (scope.storeId) {
    const storeEntry = entitlements.stores.find((s) => s.storeId === scope.storeId);
    if (!storeEntry) return false;
    return roleGrantsPermission(source, storeEntry.role, permission);
  }

  if (scope.organizationId) {
    const orgEntry = entitlements.organizations.find(
      (o) => o.organizationId === scope.organizationId,
    );
    if (!orgEntry) return false;
    return roleGrantsPermission(source, orgEntry.role, permission);
  }

  // No scope given: only a platform-level grant (handled above) can authorize this.
  return false;
}

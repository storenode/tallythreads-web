import { describe, expect, it } from "vitest";
import {
  resolveEntitlements,
  hasPermission,
  type EntitlementsSource,
} from "./entitlements";

// Mirrors the M1b §2 schema (roles/permissions/role_permissions/memberships/stores)
// and the §1 seed set, trimmed to what these scenarios exercise.
const roles: EntitlementsSource["roles"] = [
  { id: "role-platform-admin", name: "platform_admin", scope_type: "platform" },
  { id: "role-org-owner", name: "org_owner", scope_type: "organization" },
  { id: "role-org-manager", name: "org_manager", scope_type: "organization" },
  { id: "role-org-accountant", name: "org_accountant", scope_type: "organization" },
  { id: "role-store-sales", name: "store_sales_staff", scope_type: "store" },
  { id: "role-store-cleaning", name: "store_cleaning_staff", scope_type: "store" },
];

const permissions: EntitlementsSource["permissions"] = [
  { id: "perm-org-create", key: "org.create" },
  { id: "perm-store-create", key: "store.create" },
  { id: "perm-billing-write", key: "billing.write" },
  { id: "perm-billing-read", key: "billing.read" },
  { id: "perm-reports-read", key: "reports.read" },
  { id: "perm-settlement-read", key: "settlement.read" },
  { id: "perm-maintenance-access", key: "maintenance.access" },
];

// Matches the seed in 20260822090100_m1b_roles_permissions.sql.
const rolePermissions: EntitlementsSource["rolePermissions"] = [
  // platform_admin: everything
  ...permissions.map((p) => ({ role_id: "role-platform-admin", permission_id: p.id })),
  // org_owner: store.create, billing.*, reports.read, settlement.read
  { role_id: "role-org-owner", permission_id: "perm-store-create" },
  { role_id: "role-org-owner", permission_id: "perm-billing-write" },
  { role_id: "role-org-owner", permission_id: "perm-billing-read" },
  { role_id: "role-org-owner", permission_id: "perm-reports-read" },
  { role_id: "role-org-owner", permission_id: "perm-settlement-read" },
  // org_accountant: reports.read, settlement.read only — no store.create
  { role_id: "role-org-accountant", permission_id: "perm-reports-read" },
  { role_id: "role-org-accountant", permission_id: "perm-settlement-read" },
  // store_sales_staff: billing.*
  { role_id: "role-store-sales", permission_id: "perm-billing-write" },
  { role_id: "role-store-sales", permission_id: "perm-billing-read" },
  // store_cleaning_staff: maintenance.access only
  { role_id: "role-store-cleaning", permission_id: "perm-maintenance-access" },
];

const stores: EntitlementsSource["stores"] = [
  { id: "store-a1", organization_id: "org-a" },
  { id: "store-a2", organization_id: "org-a" },
  { id: "store-b1", organization_id: "org-b" },
];

function source(
  memberships: EntitlementsSource["memberships"],
): EntitlementsSource {
  return { memberships, roles, permissions, rolePermissions, stores };
}

describe("resolveEntitlements / hasPermission", () => {
  it("1. org_owner reaches a store they never personally created, via org cascade", () => {
    const src = source([
      {
        id: "m1",
        member_id: "mem-1",
        role_id: "role-org-owner",
        organization_id: "org-a",
        store_id: null,
        deleted_at: null,
      },
    ]);

    const entitlements = resolveEntitlements("mem-1", src);
    expect(entitlements.stores).toContainEqual({
      storeId: "store-a1",
      role: "org_owner",
      via: "org_cascade",
    });
    expect(entitlements.stores).toContainEqual({
      storeId: "store-a2",
      role: "org_owner",
      via: "org_cascade",
    });

    expect(hasPermission("mem-1", "billing.read", { storeId: "store-a1" }, src)).toBe(
      true,
    );
  });

  it("2. org_accountant is denied store.create even though they're a real org member", () => {
    const src = source([
      {
        id: "m1",
        member_id: "mem-2",
        role_id: "role-org-accountant",
        organization_id: "org-a",
        store_id: null,
        deleted_at: null,
      },
    ]);

    expect(
      hasPermission("mem-2", "store.create", { organizationId: "org-a" }, src),
    ).toBe(false);
    // sanity: they do keep their actual read grants
    expect(
      hasPermission("mem-2", "reports.read", { organizationId: "org-a" }, src),
    ).toBe(true);
  });

  it("3. a store-scoped role resolves correctly with zero org affiliation", () => {
    const src = source([
      {
        id: "m1",
        member_id: "mem-3",
        role_id: "role-store-sales",
        organization_id: null,
        store_id: "store-b1",
        deleted_at: null,
      },
    ]);

    const entitlements = resolveEntitlements("mem-3", src);
    expect(entitlements.organizations).toEqual([]);
    expect(entitlements.stores).toEqual([
      { storeId: "store-b1", role: "store_sales_staff", via: "direct" },
    ]);
    expect(hasPermission("mem-3", "billing.write", { storeId: "store-b1" }, src)).toBe(
      true,
    );
  });

  it("4. a revoked (soft-deleted) membership no longer grants access", () => {
    const src = source([
      {
        id: "m1",
        member_id: "mem-4",
        role_id: "role-store-sales",
        organization_id: null,
        store_id: "store-b1",
        deleted_at: "2026-08-22T00:00:00Z",
      },
    ]);

    const entitlements = resolveEntitlements("mem-4", src);
    expect(entitlements.stores).toEqual([]);
    expect(hasPermission("mem-4", "billing.write", { storeId: "store-b1" }, src)).toBe(
      false,
    );
  });

  it("5. platform_admin passes every permission check, at every scope, with no prior relationship", () => {
    const src = source([
      {
        id: "m1",
        member_id: "mem-5",
        role_id: "role-platform-admin",
        organization_id: null,
        store_id: null,
        deleted_at: null,
      },
    ]);

    expect(hasPermission("mem-5", "org.create", {}, src)).toBe(true);
    expect(
      hasPermission("mem-5", "store.create", { organizationId: "org-a" }, src),
    ).toBe(true);
    expect(hasPermission("mem-5", "billing.write", { storeId: "store-b1" }, src)).toBe(
      true,
    );
    // even a scope the platform_admin has never been individually granted
    expect(
      hasPermission("mem-5", "maintenance.access", { storeId: "store-a2" }, src),
    ).toBe(true);
  });

  it("6. a member with zero memberships resolves to nothing cleanly", () => {
    const src = source([]);

    const entitlements = resolveEntitlements("mem-6", src);
    expect(entitlements).toEqual({
      platformRole: null,
      organizations: [],
      stores: [],
    });
    expect(hasPermission("mem-6", "billing.read", { storeId: "store-a1" }, src)).toBe(
      false,
    );
    expect(hasPermission("mem-6", "org.create", {}, src)).toBe(false);
  });

  it("7. two roles at unrelated scopes on the same member resolve independently, no leakage", () => {
    const src = source([
      {
        id: "m1",
        member_id: "mem-7",
        role_id: "role-org-owner",
        organization_id: "org-a",
        store_id: null,
        deleted_at: null,
      },
      {
        id: "m2",
        member_id: "mem-7",
        role_id: "role-store-sales",
        organization_id: null,
        store_id: "store-b1",
        deleted_at: null,
      },
    ]);

    // org_owner at org-a cascades into org-a's stores only, not store-b1
    expect(hasPermission("mem-7", "billing.read", { storeId: "store-a1" }, src)).toBe(
      true,
    );
    // the direct store-b1 grant is store_sales_staff, which has no reports.read
    expect(hasPermission("mem-7", "reports.read", { storeId: "store-b1" }, src)).toBe(
      false,
    );
    // and store-b1's billing access shouldn't be elevated by the unrelated org_owner role
    expect(hasPermission("mem-7", "billing.write", { storeId: "store-b1" }, src)).toBe(
      true, // store_sales_staff itself grants billing.write directly
    );

    const entitlements = resolveEntitlements("mem-7", src);
    expect(entitlements.organizations).toEqual([
      { organizationId: "org-a", role: "org_owner" },
    ]);
    expect(entitlements.stores).toContainEqual({
      storeId: "store-b1",
      role: "store_sales_staff",
      via: "direct",
    });
    // org-a cascade must not include store-b1 (unrelated org)
    expect(
      entitlements.stores.find((s) => s.storeId === "store-b1"),
    ).not.toEqual(
      expect.objectContaining({ via: "org_cascade" }),
    );
  });
});

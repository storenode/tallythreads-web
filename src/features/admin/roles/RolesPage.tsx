import { Fragment, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeading } from "@/components/ui/PageHeading";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { Spinner } from "@/components/ui/Spinner";
import {
  roleDisplayName,
  useCreatePermission,
  useCreateRole,
  useDeletePermission,
  useDeleteRole,
  usePermissions,
  useRolePermissionGrants,
  useRoles,
  useSetRolePermission,
  type Permission,
  type RoleScope,
} from "./roles";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

const SCOPE_LABELS: Record<RoleScope, string> = {
  platform: "Platform",
  organization: "Organization",
  store: "Store",
};

const ROLE_SCOPE_OPTIONS: { value: RoleScope; label: string }[] = [
  { value: "platform", label: "Platform" },
  { value: "organization", label: "Organization" },
  { value: "store", label: "Store" },
];

function cellKey(roleId: string, permissionId: string) {
  return `${roleId}:${permissionId}`;
}

function groupByModule(permissions: Permission[]) {
  const groups: { module: string; items: Permission[] }[] = [];
  for (const p of permissions) {
    const last = groups[groups.length - 1];
    if (last && last.module === p.module) last.items.push(p);
    else groups.push({ module: p.module, items: [p] });
  }
  return groups;
}

export default function RolesPage() {
  const { data: roles, isLoading: rolesLoading, isError: rolesError } = useRoles();
  const {
    data: permissions,
    isLoading: permsLoading,
    isError: permsError,
  } = usePermissions();
  const {
    data: grants,
    isLoading: grantsLoading,
    isError: grantsError,
  } = useRolePermissionGrants();

  const createRoleMut = useCreateRole();
  const deleteRoleMut = useDeleteRole();
  const createPermissionMut = useCreatePermission();
  const deletePermissionMut = useDeletePermission();
  const setGrant = useSetRolePermission();

  const [pageError, setPageError] = useState<string | null>(null);
  const [pendingCells, setPendingCells] = useState<Set<string>>(new Set());

  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleScope, setNewRoleScope] = useState<RoleScope>("organization");

  const [permFormOpen, setPermFormOpen] = useState(false);
  const [newPermKey, setNewPermKey] = useState("");
  const [newPermModule, setNewPermModule] = useState("");

  const [confirmDeleteRole, setConfirmDeleteRole] = useState<string | null>(null);
  const [confirmDeletePerm, setConfirmDeletePerm] = useState<string | null>(null);

  const isLoading = rolesLoading || permsLoading || grantsLoading;
  const isError = rolesError || permsError || grantsError;

  const grantSet = new Set(
    (grants ?? []).map((g) => cellKey(g.role_id, g.permission_id)),
  );
  const grouped = groupByModule(permissions ?? []);
  const existingModules = [...new Set((permissions ?? []).map((p) => p.module))];

  const toggleGrant = async (
    roleId: string,
    permissionId: string,
    currentlyGranted: boolean,
  ) => {
    const key = cellKey(roleId, permissionId);
    setPageError(null);
    setPendingCells((prev) => new Set(prev).add(key));
    try {
      await setGrant.mutateAsync({
        roleId,
        permissionId,
        granted: !currentlyGranted,
      });
    } catch (err) {
      setPageError(errorMessage(err, "Couldn't update that grant."));
    } finally {
      setPendingCells((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const handleCreateRole = async () => {
    setPageError(null);
    const name = newRoleName.trim();
    if (!name) {
      setPageError("Enter a role name.");
      return;
    }
    try {
      await createRoleMut.mutateAsync({ name, scope_type: newRoleScope });
      setNewRoleName("");
      setRoleFormOpen(false);
    } catch (err) {
      setPageError(errorMessage(err, "Couldn't create the role."));
    }
  };

  const handleDeleteRole = async (id: string) => {
    setPageError(null);
    try {
      await deleteRoleMut.mutateAsync(id);
      setConfirmDeleteRole(null);
    } catch (err) {
      setPageError(
        errorMessage(
          err,
          "Couldn't delete this role — it may still have members holding it.",
        ),
      );
    }
  };

  const handleCreatePermission = async () => {
    setPageError(null);
    const key = newPermKey.trim();
    const module = newPermModule.trim();
    if (!key || !module) {
      setPageError("Enter both a permission key and a module.");
      return;
    }
    try {
      await createPermissionMut.mutateAsync({ key, module });
      setNewPermKey("");
      setNewPermModule("");
      setPermFormOpen(false);
    } catch (err) {
      setPageError(errorMessage(err, "Couldn't create the permission."));
    }
  };

  const handleDeletePermission = async (id: string) => {
    setPageError(null);
    try {
      await deletePermissionMut.mutateAsync(id);
      setConfirmDeletePerm(null);
    } catch (err) {
      setPageError(
        errorMessage(
          err,
          "Couldn't delete this permission — it may still be granted to a role.",
        ),
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading>Roles &amp; Permissions</PageHeading>

      {pageError && <p className="text-sm text-red-500">{pageError}</p>}

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      )}

      {isError && (
        <p className="text-sm text-red-500">
          Couldn&apos;t load roles and permissions.
        </p>
      )}

      {!isLoading && !isError && (
        <>
          <Card
            title="Roles"
            desc="Seeded roles are locked — you can change what they're granted below, but not their name or scope."
            actions={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRoleFormOpen((v) => !v)}
              >
                {roleFormOpen ? "Close" : "New role"}
              </Button>
            }
          >
            {roleFormOpen && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Role name"
                    placeholder="store_manager"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                  />
                  <SingleSelect
                    label="Scope"
                    placeholder={null}
                    options={ROLE_SCOPE_OPTIONS}
                    value={newRoleScope}
                    onChange={(e) =>
                      setNewRoleScope(e.target.value as RoleScope)
                    }
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateRole}
                    disabled={createRoleMut.isPending}
                  >
                    {createRoleMut.isPending ? "Creating…" : "Create role"}
                  </Button>
                </div>
              </div>
            )}
            {(roles?.length ?? 0) === 0 ? (
              <p className="text-sm text-fg-muted">No roles yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border-b border-border px-3 py-2 text-left font-medium text-fg-muted">
                        Role
                      </th>
                      <th className="border-b border-border px-3 py-2 text-left font-medium text-fg-muted">
                        Scope
                      </th>
                      <th className="border-b border-border px-3 py-2 text-left font-medium text-fg-muted">
                        Status
                      </th>
                      <th className="border-b border-border px-3 py-2 text-right font-medium text-fg-muted">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles!.map((role) => (
                      <tr key={role.id} className="border-b border-border/60">
                        <td className="px-3 py-2 text-fg">
                          <div>{roleDisplayName(role.name)}</div>
                          {role.is_system && (
                            <code className="font-mono text-xs text-fg-muted">
                              {role.name}
                            </code>
                          )}
                        </td>
                        <td className="px-3 py-2 text-fg-muted">
                          {SCOPE_LABELS[role.scope_type]}
                        </td>
                        <td className="px-3 py-2">
                          {role.is_system ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-fg-muted">
                              🔒 System
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full border border-tt-green-500/40 px-2 py-0.5 text-xs font-medium text-tt-green-600">
                              Custom
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {role.is_system ? (
                            <span className="text-xs text-fg-muted">
                              Locked
                            </span>
                          ) : confirmDeleteRole === role.id ? (
                            <span className="inline-flex gap-2">
                              <button
                                type="button"
                                className="text-xs font-medium text-red-500 hover:underline"
                                onClick={() => handleDeleteRole(role.id)}
                                disabled={deleteRoleMut.isPending}
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                className="text-xs text-fg-muted hover:underline"
                                onClick={() => setConfirmDeleteRole(null)}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="text-xs text-fg-muted hover:text-red-500 hover:underline"
                              onClick={() => setConfirmDeleteRole(role.id)}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card
            title="Permissions & grants"
            desc="Check a box to grant that role a permission, uncheck to revoke. A locked row/column is seeded — its grants are still editable, just not its name/key."
            actions={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPermFormOpen((v) => !v)}
              >
                {permFormOpen ? "Close" : "New permission"}
              </Button>
            }
          >
            {permFormOpen && (
              <div className="space-y-3 rounded-xl border border-border p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Permission key"
                    placeholder="module.action, e.g. billing.write"
                    value={newPermKey}
                    onChange={(e) => setNewPermKey(e.target.value)}
                  />
                  <Input
                    label="Module"
                    placeholder="e.g. Billing"
                    list="existing-modules"
                    value={newPermModule}
                    onChange={(e) => setNewPermModule(e.target.value)}
                  />
                  <datalist id="existing-modules">
                    {existingModules.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreatePermission}
                    disabled={createPermissionMut.isPending}
                  >
                    {createPermissionMut.isPending
                      ? "Creating…"
                      : "Create permission"}
                  </Button>
                </div>
              </div>
            )}

            {(roles?.length ?? 0) === 0 || (permissions?.length ?? 0) === 0 ? (
              <p className="text-sm text-fg-muted">
                {(roles?.length ?? 0) === 0
                  ? "Add a role above first."
                  : "No permissions yet."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 min-w-[240px] border-b border-border bg-surface px-3 py-2 text-left align-bottom font-medium text-fg-muted">
                        Permission
                      </th>
                      {roles!.map((role) => (
                        <th
                          key={role.id}
                          className="min-w-[150px] border-b border-border px-3 py-2 text-left align-bottom font-medium"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-fg">
                              {roleDisplayName(role.name)}
                            </span>
                            {role.is_system && (
                              <span
                                title="Seeded role — name/scope locked"
                                className="text-xs"
                              >
                                🔒
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-normal text-fg-muted">
                            {SCOPE_LABELS[role.scope_type]}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map((group) => (
                      <Fragment key={group.module}>
                        <tr>
                          <td
                            colSpan={(roles?.length ?? 0) + 1}
                            className="sticky left-0 bg-surface px-3 py-1.5 text-xs font-semibold tracking-wide text-fg-muted uppercase"
                          >
                            {group.module}
                          </td>
                        </tr>
                        {group.items.map((perm) => (
                          <tr key={perm.id} className="border-b border-border/60">
                            <td className="sticky left-0 z-10 bg-surface px-3 py-2 align-top">
                              <div className="flex items-center gap-1.5">
                                <code className="font-mono text-xs text-fg">
                                  {perm.key}
                                </code>
                                {perm.is_system && (
                                  <span
                                    title="Seeded permission — key/module locked"
                                    className="text-xs"
                                  >
                                    🔒
                                  </span>
                                )}
                              </div>
                              {!perm.is_system &&
                                (confirmDeletePerm === perm.id ? (
                                  <span className="mt-0.5 flex gap-1.5">
                                    <button
                                      type="button"
                                      className="text-xs font-medium text-red-500 hover:underline"
                                      onClick={() =>
                                        handleDeletePermission(perm.id)
                                      }
                                      disabled={deletePermissionMut.isPending}
                                    >
                                      Confirm delete
                                    </button>
                                    <button
                                      type="button"
                                      className="text-xs text-fg-muted hover:underline"
                                      onClick={() => setConfirmDeletePerm(null)}
                                    >
                                      Cancel
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="mt-0.5 block text-xs text-fg-muted hover:text-red-500 hover:underline"
                                    onClick={() => setConfirmDeletePerm(perm.id)}
                                  >
                                    Delete
                                  </button>
                                ))}
                            </td>
                            {roles!.map((role) => {
                              const key = cellKey(role.id, perm.id);
                              const granted = grantSet.has(key);
                              const pending = pendingCells.has(key);
                              return (
                                <td key={role.id} className="px-3 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    aria-label={`${roleDisplayName(role.name)} — ${perm.key}`}
                                    className="size-4 cursor-pointer rounded border-border accent-tt-green-500 disabled:cursor-not-allowed disabled:opacity-50"
                                    checked={granted}
                                    disabled={pending}
                                    onChange={() =>
                                      toggleGrant(role.id, perm.id, granted)
                                    }
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { PageHeading } from "@/components/ui/PageHeading";
import { Spinner } from "@/components/ui/Spinner";
import {
  useArchiveOrganization,
  useHardDeleteOrganization,
  useOrganizations,
  type Organization,
  type RegistrationType,
} from "./organizations";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

const REGISTRATION_LABELS: Record<RegistrationType, string> = {
  independent: "Independent",
  chain: "Chain",
  franchise: "Franchise",
};

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "demo";
}) {
  const toneClass =
    tone === "demo"
      ? "border-tt-lavender-500/40 text-tt-lavender-600"
      : "border-border text-fg-muted";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass}`}
    >
      {children}
    </span>
  );
}

export default function OrganizationListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: organizations, isLoading, isError } = useOrganizations();
  // Demo orgs (e.g. anything created from the Demo Data module, or with the
  // "Demo organization" checkbox on) are common enough day-to-day that hiding
  // them by default just makes freshly-created orgs look like they vanished.
  const [showDemo, setShowDemo] = useState(true);
  const [warning, setWarning] = useState<string | null>(
    (location.state as { warning?: string } | null)?.warning ?? null,
  );
  const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const archiveOrg = useArchiveOrganization();
  const hardDeleteOrg = useHardDeleteOrganization();

  const visible = (organizations ?? []).filter(
    (org) => showDemo || !org.is_demo,
  );

  const closeDeleteModal = () => {
    setOrgToDelete(null);
    setDeleteError(null);
    setConfirmName("");
  };

  const handleDisable = async () => {
    if (!orgToDelete) return;
    setDeleteError(null);
    try {
      await archiveOrg.mutateAsync(orgToDelete.id);
      closeDeleteModal();
    } catch (err) {
      setDeleteError(errorMessage(err, "Couldn't disable the organization."));
    }
  };

  const handleHardDelete = async () => {
    if (!orgToDelete) return;
    setDeleteError(null);
    try {
      await hardDeleteOrg.mutateAsync(orgToDelete.id);
      closeDeleteModal();
    } catch (err) {
      setDeleteError(errorMessage(err, "Couldn't delete the organization."));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <Button size="sm" onClick={() => navigate("/admin/organizations/new")}>
            New organization
          </Button>
        }
      >
        Organizations
      </PageHeading>

      {warning && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <p className="text-sm text-amber-700">{warning}</p>
          <button
            type="button"
            onClick={() => setWarning(null)}
            className="text-sm font-medium text-amber-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          className="size-4 cursor-pointer rounded border-border accent-tt-green-500"
          checked={showDemo}
          onChange={(e) => setShowDemo(e.target.checked)}
        />
        Show demo organizations
      </label>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      )}

      {isError && (
        <p className="text-sm text-red-500">Couldn&apos;t load organizations.</p>
      )}

      {!isLoading && !isError && visible.length === 0 && (
        <Card>
          <p className="text-sm text-fg-muted">
            No organizations{organizations?.length ? " match the current filter" : " yet"}.
          </p>
        </Card>
      )}

      {visible.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((org) => (
            <div
              key={org.id}
              className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 sm:p-6"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-medium text-fg">{org.name}</h3>
                  {org.is_demo && <Badge tone="demo">Demo</Badge>}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {org.registration_type && (
                    <Badge>{REGISTRATION_LABELS[org.registration_type]}</Badge>
                  )}
                  <Badge>{org.status}</Badge>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/admin/organizations/${org.id}/edit`)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="border-red-500/50 text-red-500 hover:enabled:bg-red-500/10"
                  onClick={() => setOrgToDelete(org)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!orgToDelete}
        onClose={closeDeleteModal}
        title="Remove organization?"
      >
        <p className="text-sm text-fg-muted">
          Choose how to remove{" "}
          <span className="font-medium text-fg">{orgToDelete?.name}</span>.
        </p>

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-border p-4">
            <p className="text-sm font-medium text-fg">Disable</p>
            <p className="mt-1 text-sm text-fg-muted">
              Soft-delete — hides the organization from the console. Its stores,
              memberships, and history stay in the database, and it can be
              restored later by an engineer.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-3"
              onClick={handleDisable}
              disabled={archiveOrg.isPending || hardDeleteOrg.isPending}
            >
              {archiveOrg.isPending ? "Disabling…" : "Disable"}
            </Button>
          </div>

          <div className="rounded-xl border border-red-500/40 p-4">
            <p className="text-sm font-medium text-red-500">Delete permanently</p>
            <p className="mt-1 text-sm text-fg-muted">
              Hard delete — permanently removes this organization and its entire
              footprint: stores, memberships, invitations, channels, and access
              grants, plus any franchise groups it owns (and, in turn, the
              franchise links and settlement rules on those groups, even for
              stores belonging to other organizations). This cannot be undone.
            </p>
            <label className="mt-3 block text-xs text-fg-muted">
              Type <span className="font-medium text-fg">{orgToDelete?.name}</span>{" "}
              to confirm
            </label>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={orgToDelete?.name}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-fg"
            />
            <Button
              type="button"
              className="mt-3 bg-red-500 hover:enabled:bg-red-600"
              onClick={handleHardDelete}
              disabled={
                archiveOrg.isPending ||
                hardDeleteOrg.isPending ||
                confirmName.trim() !== orgToDelete?.name
              }
            >
              {hardDeleteOrg.isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </div>

        {deleteError && (
          <p className="mt-3 text-sm text-red-500">{deleteError}</p>
        )}

        <div className="mt-4 flex justify-end">
          <Button type="button" variant="ghost" onClick={closeDeleteModal}>
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}

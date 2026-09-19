import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  useArchiveOrganization,
  useHardDeleteOrganization,
  type Organization,
} from "./organizations";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Reusable safe-delete control for an organization: a trigger button that opens
 * a modal offering the two graded removals from the old organizations list —
 * **Disable** (soft archive, reversible) and **Delete permanently** (hard
 * delete, gated behind typing the org name). Shared by the directory/demo cards
 * and the setup wizard's Organization step so there's a single delete flow.
 *
 * `onDone` fires after either action succeeds (e.g. the wizard navigates back to
 * the directory; the cards just rely on the hook's query invalidation).
 */
export function OrgDeleteControl({
  org,
  onDone,
  className,
  label = "Delete",
}: {
  org: Pick<Organization, "id" | "name">;
  onDone?: () => void;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const archiveOrg = useArchiveOrganization();
  const hardDeleteOrg = useHardDeleteOrganization();

  const pending = archiveOrg.isPending || hardDeleteOrg.isPending;

  const close = () => {
    setOpen(false);
    setConfirmName("");
    setError(null);
  };

  const handleDisable = async () => {
    setError(null);
    try {
      await archiveOrg.mutateAsync(org.id);
      close();
      onDone?.();
    } catch (err) {
      setError(errorMessage(err, "Couldn't disable the organization."));
    }
  };

  const handleHardDelete = async () => {
    setError(null);
    try {
      await hardDeleteOrg.mutateAsync(org.id);
      close();
      onDone?.();
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete the organization."));
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={`border-red-500/50 !text-red-500 hover:enabled:!bg-red-500/10 ${className ?? ""}`}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>

      <Modal open={open} onClose={close} title="Remove organization?">
        <p className="text-sm text-fg-muted">
          Choose how to remove{" "}
          <span className="font-medium text-fg">{org.name}</span>.
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
              disabled={pending}
            >
              {archiveOrg.isPending ? "Disabling…" : "Disable"}
            </Button>
          </div>

          <div className="rounded-xl border border-red-500/40 p-4">
            <p className="text-sm font-medium text-red-500">Delete permanently</p>
            <p className="mt-1 text-sm text-fg-muted">
              Hard delete — permanently removes this organization and its entire
              footprint: stores, warehouses, stock locations, memberships,
              invitations, channels, and access grants, plus any franchise groups
              it owns (and, in turn, the franchise links and settlement rules on
              those groups). This cannot be undone.
            </p>
            <label className="mt-3 block text-xs text-fg-muted">
              Type <span className="font-medium text-fg">{org.name}</span> to
              confirm
            </label>
            <input
              type="text"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={org.name}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-fg"
            />
            <Button
              type="button"
              className="mt-3 bg-red-500 hover:enabled:bg-red-600"
              onClick={handleHardDelete}
              disabled={pending || confirmName.trim() !== org.name}
            >
              {hardDeleteOrg.isPending ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="mt-4 flex justify-end">
          <Button type="button" variant="ghost" onClick={close}>
            Cancel
          </Button>
        </div>
      </Modal>
    </>
  );
}

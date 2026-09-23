import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useStoresByOrg, useStoreManagerCoverage } from "@/features/stores/stores";
import { useWarehousesByOrg } from "@/features/warehouses/data";
import { useUpdateOrganization } from "../../organizations/organizations";
import { useSetupNav, useSetupOrg } from "../SetupWizardLayout";
import { SetupStepFooter } from "./SetupStepFooter";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Wizard step 5: a recap plus the "Go live" action (flips the org to active).
 * Go live is gated — the org needs a primary contact (Owner) and every store
 * needs an owner (a Manager) — with a checklist of exactly what's missing.
 */
export default function GoLiveStep() {
  const { org } = useSetupOrg();
  const { exitTo } = useSetupNav();
  const navigate = useNavigate();
  const updateOrg = useUpdateOrganization();
  const { data: stores } = useStoresByOrg(org.id);
  const { data: coverage } = useStoreManagerCoverage(org.id);
  const warehouses = useWarehousesByOrg(org.id);
  const [serverError, setServerError] = useState<string | null>(null);

  const storeList = stores ?? [];
  const storeCount = storeList.length;
  const roomCount = warehouses?.length ?? 0;
  const alreadyLive = org.status === "active";
  const hasPrimary = org.primary_contact_member_id != null;
  const storesMissingManager = storeList.filter((s) => !(coverage?.[s.id]));

  const blockers: string[] = [];
  if (storeCount === 0) blockers.push("Add at least one store.");
  if (!hasPrimary)
    blockers.push("Add an organization owner (primary contact) — Members step.");
  for (const s of storesMissingManager)
    blockers.push(`${s.name}: add an owner (Manager) — Members step.`);

  const canGoLive = blockers.length === 0;

  const goLive = async () => {
    setServerError(null);
    if (alreadyLive) {
      navigate(exitTo);
      return;
    }
    try {
      await updateOrg.mutateAsync({ id: org.id, patch: { status: "active" } });
      navigate(exitTo);
    } catch (err) {
      setServerError(errorMessage(err, "Couldn't activate the organization."));
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Review" desc="A quick recap before this organization goes live.">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-fg-muted">Organization</dt>
            <dd className="mt-1 text-sm font-medium text-fg">{org.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Stores</dt>
            <dd className="mt-1 text-sm font-medium text-fg">{storeCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Stock rooms</dt>
            <dd className="mt-1 text-sm font-medium text-fg">{roomCount}</dd>
          </div>
        </dl>

        {!alreadyLive && blockers.length > 0 && (
          <div className="mt-4 rounded-lg border border-warning-text/40 bg-warning-bg px-3 py-2">
            <p className="text-sm font-medium text-warning-text">
              Before going live:
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-warning-text">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        {alreadyLive && (
          <p className="mt-4 text-sm text-success-text">
            This organization is already live.
          </p>
        )}

        {serverError && <p className="mt-4 text-sm text-red-500">{serverError}</p>}

        <div className="mt-6 flex justify-end">
          <Button
            type="button"
            onClick={goLive}
            disabled={updateOrg.isPending || (!canGoLive && !alreadyLive)}
          >
            {updateOrg.isPending
              ? "Activating…"
              : alreadyLive
                ? "Done"
                : "Go live"}
          </Button>
        </div>
      </Card>

      <SetupStepFooter back="members" next="finish" nextLabel="Finish later" />
    </div>
  );
}

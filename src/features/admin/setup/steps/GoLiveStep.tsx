import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useStoresByOrg } from "@/features/stores/stores";
import { useWarehousesByOrg } from "@/features/warehouses/data";
import { useUpdateOrganization } from "../../organizations/organizations";
import { useSetupNav, useSetupOrg } from "../SetupWizardLayout";
import { SetupStepFooter } from "./SetupStepFooter";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Wizard step 4: a read-only recap of what's been set up, then a single
 * "Go live" action that flips the org from trial to active. Stores must exist
 * before an org can go live; everything else is optional.
 */
export default function GoLiveStep() {
  const { org } = useSetupOrg();
  const { exitTo } = useSetupNav();
  const navigate = useNavigate();
  const updateOrg = useUpdateOrganization();
  const { data: stores } = useStoresByOrg(org.id);
  const warehouses = useWarehousesByOrg(org.id);
  const [serverError, setServerError] = useState<string | null>(null);

  const storeCount = stores?.length ?? 0;
  const roomCount = warehouses?.length ?? 0;
  const alreadyLive = org.status === "active";
  const canGoLive = storeCount > 0;

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

        {!canGoLive && (
          <p className="mt-4 rounded-lg border border-warning-text/40 bg-warning-bg px-3 py-2 text-sm text-warning-text">
            Add at least one store before going live.
          </p>
        )}

        {alreadyLive && (
          <p className="mt-4 text-sm text-success-text">
            This organization is already live.
          </p>
        )}

        {serverError && (
          <p className="mt-4 text-sm text-red-500">{serverError}</p>
        )}

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

      <SetupStepFooter back="stock-setup" next="finish" nextLabel="Finish later" />
    </div>
  );
}

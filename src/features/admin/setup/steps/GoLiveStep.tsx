import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useStoresByOrg, useStoreMemberSummary } from "@/features/stores/stores";
import { useWarehousesByOrg } from "@/features/warehouses/data";
import {
  useOrganizationMembers,
  useUpdateOrganization,
} from "../../organizations/organizations";
import { useSetupNav, useSetupOrg } from "../SetupWizardLayout";
import { SetupStepFooter } from "./SetupStepFooter";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Wizard step 5: a recap (org members label + per-store members table) plus the
 * "Go live" action (flips the org to active). Go live is gated — the org needs a
 * primary contact (Owner) and every store needs an owner (a Manager) — with a
 * checklist of what's missing. An already-live org that's missing these is
 * flagged rather than shown as simply "live".
 */
export default function GoLiveStep() {
  const { org } = useSetupOrg();
  const { exitTo } = useSetupNav();
  const navigate = useNavigate();
  const updateOrg = useUpdateOrganization();
  const { data: stores } = useStoresByOrg(org.id);
  const { data: summary } = useStoreMemberSummary(org.id);
  const { data: orgMembers } = useOrganizationMembers(org.id);
  const warehouses = useWarehousesByOrg(org.id);
  const [serverError, setServerError] = useState<string | null>(null);

  const storeList = stores ?? [];
  const storeCount = storeList.length;
  const roomCount = warehouses?.length ?? 0;
  const orgMemberCount = (orgMembers ?? []).filter(
    (m) => !m.roleName.startsWith("store_"),
  ).length;
  const alreadyLive = org.status === "active";
  const hasPrimary = org.primary_contact_member_id != null;
  const storesMissingManager = storeList.filter(
    (s) => !summary?.[s.id]?.hasManager,
  );

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
        <dl className="grid gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-fg-muted">Organization</dt>
            <dd className="mt-1 text-sm font-medium text-fg">{org.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">Org members</dt>
            <dd className="mt-1 text-sm font-medium text-fg">{orgMemberCount}</dd>
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

        {storeCount > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs font-medium tracking-wide text-fg-muted uppercase">
              Store members
            </p>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-fg-muted">
                    <th className="px-3 py-2 font-medium">Store</th>
                    <th className="px-3 py-2 font-medium">Members</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {storeList.map((s) => {
                    const row = summary?.[s.id];
                    const hasManager = row?.hasManager ?? false;
                    return (
                      <tr key={s.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-fg">
                          {s.name}
                          {s.store_code && (
                            <span className="ml-2 text-xs text-fg-muted">
                              {s.store_code}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-fg">{row?.count ?? 0}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              hasManager
                                ? "bg-success-bg text-success-text"
                                : "bg-warning-bg text-warning-text"
                            }`}
                          >
                            {hasManager ? "Owner set" : "No owner"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {blockers.length > 0 && (
          <div className="mt-6 rounded-lg border border-warning-text/40 bg-warning-bg px-3 py-2">
            <p className="text-sm font-medium text-warning-text">
              {alreadyLive
                ? "This organization is live but is missing:"
                : "Before going live:"}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-warning-text">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        {alreadyLive && blockers.length === 0 && (
          <p className="mt-4 text-sm text-success-text">
            This organization is live.
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

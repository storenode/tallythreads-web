import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { OrganizationEditFormCard } from "../../organizations/OrganizationForm";
import { OrgDeleteControl } from "../../organizations/OrgDeleteControl";
import { useSetupNav, useSetupOrg } from "../SetupWizardLayout";

/**
 * Wizard step 1 for an existing org: reuses the console's org edit form
 * (registration details, logo, contact) with its Save action wired to advance
 * to the Stores step. There's no Cancel/Back here — the layout's exit link
 * already covers leaving, and this is the first step — so Save doubles as Next.
 * The danger zone (admin console only) carries the same safe delete used on the
 * directory cards; org members can't delete their own org.
 */
export default function OrganizationStep() {
  const { org } = useSetupOrg();
  const { area, stepPath, exitTo } = useSetupNav();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <OrganizationEditFormCard
        org={org}
        orgId={org.id}
        doneTo={stepPath("stores")}
        submitLabel="Next: Save changes →"
        hideCancel
      />

      <Card title="Organization stock rooms">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fg-muted">
            Set up org-wide storage not tied to one store — a central godown,
            transit hold, or shared warehouse.
          </p>
          <Link
            to={`${stepPath("stock-setup")}#org-stock-rooms`}
            className="shrink-0 text-sm font-medium text-tt-green-600 hover:underline"
          >
            Organization stock rooms →
          </Link>
        </div>
      </Card>

      {area === "admin" && (
        <Card title="Danger zone">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-fg-muted">
              Disable hides this organization from the console (reversible).
              Deleting permanently removes it and its entire footprint.
            </p>
            <OrgDeleteControl org={org} onDone={() => navigate(exitTo)} />
          </div>
        </Card>
      )}
    </div>
  );
}

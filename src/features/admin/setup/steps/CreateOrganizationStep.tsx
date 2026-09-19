import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { PageHeading } from "@/components/ui/PageHeading";
import { OrganizationCreateForm } from "../../organizations/OrganizationForm";
import { SetupStepper } from "../SetupStepper";
import { setupStepPath } from "../steps";

/**
 * Step 1 for a brand-new organization (`/admin/setup/new`). Reuses the exact
 * org-create form from the admin console; on success it drops the admin
 * straight into the wizard for the newly created org, at the Stores step.
 * Runs outside {@link SetupWizardLayout} because no org (and so no orgId)
 * exists yet — it renders its own heading and stepper in "create" mode.
 */
export default function CreateOrganizationStep() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <Link
            to="/admin"
            className="text-sm font-medium text-fg-muted hover:text-fg"
          >
            ← Dashboard
          </Link>
        }
      >
        New organization
      </PageHeading>

      <SetupStepper currentKey="organization" orgId={null} />

      <OrganizationCreateForm
        submitLabel="Create & continue"
        onCancel={() => navigate("/admin")}
        onCreated={(org) => navigate(setupStepPath("admin", org.id, "stores"))}
      />
    </div>
  );
}

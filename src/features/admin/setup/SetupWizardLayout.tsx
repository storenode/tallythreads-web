import { createContext, useContext } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { PageHeading } from "@/components/ui/PageHeading";
import { Spinner } from "@/components/ui/Spinner";
import {
  useOrganization,
  type OrganizationFullDetail,
} from "../organizations/organizations";
import { SetupStepper } from "./SetupStepper";
import {
  completedSetupSteps,
  SETUP_STEPS,
  setupAreaFromPath,
  setupExitPath,
  setupStepPath,
  type SetupArea,
  type SetupStepKey,
} from "./steps";

export interface SetupOutletContext {
  org: OrganizationFullDetail;
}

/** Steps read the wizard's loaded org (and never refetch it) through here. */
export function useSetupOrg(): SetupOutletContext {
  return useOutletContext<SetupOutletContext>();
}

/** Area-aware navigation for the wizard, so the same steps build the right
 * links whether mounted under /admin or /org. */
export interface SetupNav {
  area: SetupArea;
  orgId: string;
  stepPath: (key: SetupStepKey) => string;
  exitTo: string;
}

const SetupNavContext = createContext<SetupNav | null>(null);

export function useSetupNav(): SetupNav {
  const ctx = useContext(SetupNavContext);
  if (!ctx) throw new Error("useSetupNav must be used within SetupWizardLayout");
  return ctx;
}

const STEP_KEYS = SETUP_STEPS.map((s) => s.key);

/**
 * Shell for the per-org setup wizard, mounted in both consoles
 * (`/admin/setup/:orgId/*` and `/org/:orgId/setup/*`): loads the org once,
 * renders the heading + progress stepper, and hands the org + area-aware nav
 * down to the active step. The current step is read from the last path segment.
 */
export default function SetupWizardLayout() {
  const { orgId } = useParams<{ orgId: string }>();
  const location = useLocation();
  const { data: org, isLoading, isError } = useOrganization(orgId);

  const area = setupAreaFromPath(location.pathname);
  const lastSegment = location.pathname.split("/").filter(Boolean).pop() ?? "";
  const currentKey = (
    STEP_KEYS.includes(lastSegment as SetupStepKey) ? lastSegment : "organization"
  ) as SetupStepKey;

  const exitTo = setupExitPath(area, orgId ?? "");

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  }

  if (isError || !org || !orgId) {
    return (
      <div className="space-y-4">
        <PageHeading>Organization not found</PageHeading>
        <p className="text-sm text-fg-muted">
          This organization doesn&apos;t exist or couldn&apos;t be loaded.
        </p>
        <Link to={exitTo} className="text-sm font-medium text-tt-green-600">
          ← Back
        </Link>
      </div>
    );
  }

  const nav: SetupNav = {
    area,
    orgId,
    stepPath: (key) => setupStepPath(area, orgId, key),
    exitTo,
  };

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <Link
            to={exitTo}
            className="text-sm font-medium text-fg-muted hover:text-fg"
          >
            ← {area === "admin" ? "Organizations" : "Back"}
          </Link>
        }
      >
        Set up {org.name}
      </PageHeading>

      <SetupStepper
        area={area}
        currentKey={currentKey}
        orgId={orgId}
        completed={completedSetupSteps(org)}
      />

      <SetupNavContext.Provider value={nav}>
        <Outlet context={{ org } satisfies SetupOutletContext} />
      </SetupNavContext.Provider>
    </div>
  );
}

/** Redirects `/…/:orgId` (no step) to the first step, in the right console. */
export function SetupIndexRedirect() {
  const { orgId } = useParams<{ orgId: string }>();
  const location = useLocation();
  const area = setupAreaFromPath(location.pathname);
  return (
    <Navigate to={setupStepPath(area, orgId ?? "", "organization")} replace />
  );
}

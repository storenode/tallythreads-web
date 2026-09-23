import {
  Building2,
  Store,
  Boxes,
  Users,
  Rocket,
  type LucideIcon,
} from "lucide-react";
import type { OrganizationFullDetail } from "../organizations/organizations";

/**
 * Single source of truth for the organization setup wizard's steps — order,
 * labels, icons, and the relative route segment each one lives at under
 * `/admin/setup/:orgId`. The stepper, the layout's redirect logic, and every
 * step page read from here so a step is added/renamed in exactly one place.
 */
export type SetupStepKey =
  | "organization"
  | "stores"
  | "stock-setup"
  | "members"
  | "go-live";

export interface SetupStepDef {
  key: SetupStepKey;
  label: string;
  /** Short label for the stepper on narrow screens (unused when icon-only). */
  shortLabel: string;
  icon: LucideIcon;
}

export const SETUP_STEPS: SetupStepDef[] = [
  { key: "organization", label: "Organization", shortLabel: "Org", icon: Building2 },
  { key: "stores", label: "Stores", shortLabel: "Stores", icon: Store },
  { key: "stock-setup", label: "Stock setup", shortLabel: "Stock", icon: Boxes },
  { key: "members", label: "Members", shortLabel: "People", icon: Users },
  { key: "go-live", label: "Go live", shortLabel: "Live", icon: Rocket },
];

export function setupStepIndex(key: SetupStepKey): number {
  return SETUP_STEPS.findIndex((s) => s.key === key);
}

/**
 * Which console the wizard is mounted in. The same step components run in both:
 * platform admins reach it at `/admin/setup/:orgId/*`, org members at
 * `/org/:orgId/setup/*` (org-scoped guard). Path/exit helpers take the area so
 * links resolve correctly in either place.
 */
export type SetupArea = "admin" | "org";

export function setupBasePath(area: SetupArea, orgId: string): string {
  return area === "admin" ? `/admin/setup/${orgId}` : `/org/${orgId}/setup`;
}

export function setupStepPath(
  area: SetupArea,
  orgId: string,
  key: SetupStepKey,
): string {
  return `${setupBasePath(area, orgId)}/${key}`;
}

/** Where the wizard's "exit" / "back to list" and post-finish navigation go. */
export function setupExitPath(area: SetupArea, orgId: string): string {
  return area === "admin" ? "/admin/organizations" : `/org/${orgId}`;
}

/** Infers the area from the current path (admin vs org console). */
export function setupAreaFromPath(pathname: string): SetupArea {
  return pathname.startsWith("/admin") ? "admin" : "org";
}

/**
 * Which steps are "done" for an org, derived from its real data — the same
 * gates {@link computeSetupStage} uses, expressed per-step so the stepper can
 * show a check on each completed circle. The Organization step counts as done
 * the moment the org row exists (we're editing it, not creating it, in the
 * wizard layout); Go live is done once the org is active.
 */
export function completedSetupSteps(
  org: OrganizationFullDetail,
): Record<SetupStepKey, boolean> {
  // Defensive `?? []`: tolerate a briefly-bare Organization from a cache write
  // (before full detail refetches) instead of crashing during render.
  const stores = org.stores ?? [];
  const hasStores = stores.length > 0;
  const hasStock =
    (org.warehouses ?? []).length > 0 ||
    stores.some((s) => (s.stockLocations ?? []).length > 0);
  return {
    organization: true,
    stores: hasStores,
    "stock-setup": hasStock,
    // Members step reads done once the org has a primary contact (Owner). The
    // full per-store manager requirement is enforced at Go live (with a
    // checklist), which needs membership data this summary doesn't carry.
    members: org.primary_contact_member_id != null,
    "go-live": org.status === "active",
  };
}

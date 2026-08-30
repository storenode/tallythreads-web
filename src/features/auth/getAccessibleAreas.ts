import type { Entitlements } from "@/features/auth/entitlements";

export type AreaKey = "admin" | "org" | "ops";

export interface Area {
  key: AreaKey;
  label: string;
  to: string;
}

/**
 * Which top-level areas a signed-in member can reach, derived from their
 * entitlements. Mirrors the exact checks RequireArea.tsx uses to gate each route
 * tree, so "shown in the switcher" and "actually allowed in" never disagree.
 *
 * Both `to` targets point at each area's own index (/org, /ops) rather than a
 * specific org/store id — OrgPickerPage/StorePickerPage do the "which one"
 * resolution themselves (2026-08-30), so this never has to guess.
 */
export function getAccessibleAreas(
  entitlements: Entitlements | undefined,
): Area[] {
  if (!entitlements) return [];
  const areas: Area[] = [];
  if (entitlements.platformRole === "platform_admin") {
    areas.push({ key: "admin", label: "Admin", to: "/admin" });
  }
  if (entitlements.organizations.length > 0) {
    areas.push({ key: "org", label: "Organization", to: "/org" });
  }
  if (entitlements.stores.length > 0) {
    areas.push({ key: "ops", label: "Operations", to: "/ops" });
  }
  return areas;
}

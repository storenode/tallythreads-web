import type { RegistrationType } from "./organizations";

/**
 * Per-registration-type business rules, centralized so limits live in ONE place
 * rather than as inline `if (type === "independent")` checks scattered across
 * the UI. Every store-add surface reads from here, so changing a rule (or
 * adding a new registration type) is a single edit.
 *
 * `maxStores: null` means unlimited.
 */
export interface OrgPolicy {
  maxStores: number | null;
}

export const ORG_POLICY: Record<RegistrationType, OrgPolicy> = {
  // An independent org is a single legal entity running a single shop.
  independent: { maxStores: 1 },
  // Chains and franchises run many branches.
  chain: { maxStores: null },
  franchise: { maxStores: null },
};

const DEFAULT_POLICY: OrgPolicy = { maxStores: null };

export function orgPolicy(type: RegistrationType | null): OrgPolicy {
  return type ? ORG_POLICY[type] : DEFAULT_POLICY;
}

export function maxStoresFor(type: RegistrationType | null): number | null {
  return orgPolicy(type).maxStores;
}

/** Whether another store may be added, given the org's type and current count. */
export function canAddStore(
  type: RegistrationType | null,
  currentStoreCount: number,
): boolean {
  const max = maxStoresFor(type);
  return max == null || currentStoreCount < max;
}

/** Human-readable reason the store limit is reached (null = no limit hit). */
export function storeLimitReason(
  type: RegistrationType | null,
): string | null {
  const max = maxStoresFor(type);
  if (max == null) return null;
  return max === 1
    ? "Independent organizations have a single store."
    : `This organization type allows up to ${max} store${max === 1 ? "" : "s"}.`;
}

import type { PurchaseTrip, PurchaseTripStatus, SyncMeta } from "@/db";

/** Trip states from which there is no forward transition — recovery is via clone. */
export const TERMINAL_STATUSES: ReadonlySet<PurchaseTripStatus> = new Set([
  "completed",
  "cancelled",
]);

export function isTerminal(status: PurchaseTripStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * The exact field patch for a status transition, so every transition stamps the
 * lifecycle timestamps consistently in one place. Notably, moving to `active` clears
 * `completed_at` (a stale completed timestamp must never survive a (re)start), and
 * moving to `planning` clears both — the clone helper sets those directly, but keeping
 * the rule here means any future reopen path is correct for free.
 */
export function nextStatusPatch(
  next: PurchaseTripStatus,
  now: () => string,
): Partial<Omit<PurchaseTrip, keyof SyncMeta>> {
  switch (next) {
    case "active":
      return { status: "active", started_at: now(), completed_at: null };
    case "completed":
      return { status: "completed", completed_at: now() };
    case "cancelled":
      return { status: "cancelled" };
    case "planning":
      return { status: "planning", started_at: null, completed_at: null };
  }
}

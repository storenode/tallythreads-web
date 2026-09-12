import type { PurchaseInvoice, SyncMeta } from "@/db";
import { updatePurchaseInvoice, createTripActivity } from "./data";

/** Per-invoice (parcel) receiving pipeline, in order. `ready_for_inventory` hands off to M3. */
export const RECEIVING_STAGES = [
  "pending",
  "in_transit",
  "received",
  "verified",
  "ready_for_inventory",
] as const;

export type ReceivingStatus = (typeof RECEIVING_STAGES)[number];

export const RECEIVING_LABEL: Record<ReceivingStatus, string> = {
  pending: "Pending",
  in_transit: "In Transit",
  received: "Received",
  verified: "Verified",
  ready_for_inventory: "Ready for Inventory",
};

/** Tailwind classes for the stage badge (light/dark aware, brand-neutral). */
export const RECEIVING_BADGE: Record<ReceivingStatus, string> = {
  pending: "bg-bg-elevated text-fg-muted",
  in_transit: "bg-blue-500/15 text-blue-600",
  received: "bg-tt-green-500/15 text-tt-green-600",
  verified: "bg-tt-green-600/15 text-tt-green-700",
  ready_for_inventory: "bg-tt-green-600/20 text-tt-green-700",
};

/** Emoji prefix for compact chips / the store feed. */
export const RECEIVING_ICON: Record<ReceivingStatus, string> = {
  pending: "🕒",
  in_transit: "🚚",
  received: "📦",
  verified: "🔍",
  ready_for_inventory: "✅",
};

/** The next stage in the pipeline, or null if terminal (ready_for_inventory). */
export function nextReceivingStage(current: ReceivingStatus): ReceivingStatus | null {
  const i = RECEIVING_STAGES.indexOf(current);
  return i >= 0 && i < RECEIVING_STAGES.length - 1
    ? RECEIVING_STAGES[i + 1]
    : null;
}

/** Label for the button that advances to the next stage. */
export function advanceLabel(current: ReceivingStatus): string | null {
  const next = nextReceivingStage(current);
  switch (next) {
    case "in_transit":
      return "In Transit";
    case "received":
      return "Received";
    case "verified":
      return "Verify Completed";
    case "ready_for_inventory":
      return "Approve";
    default:
      return null; // terminal
  }
}

/**
 * Field patch to move a parcel to `next`, stamping the matching timestamp. Forward-only;
 * mirrors lifecycle.ts. `received` uses arrived_at (the received-at time),
 * `ready_for_inventory` uses approved_at.
 */
export function advanceReceivingPatch(
  next: ReceivingStatus,
  now: () => string,
): Partial<Omit<PurchaseInvoice, keyof SyncMeta>> {
  switch (next) {
    case "in_transit":
      return { receiving_status: "in_transit" };
    case "received":
      return { receiving_status: "received", arrived_at: now() };
    case "verified":
      return { receiving_status: "verified", verified_at: now() };
    case "ready_for_inventory":
      return { receiving_status: "ready_for_inventory", approved_at: now() };
    case "pending":
      return { receiving_status: "pending" };
  }
}

/**
 * Advance a parcel to its next receiving stage: writes the patch (offline-first, through
 * Dexie) and logs the matching trip activity. Shared by the Deliveries list (inline transport
 * bumps) and the detail page. Returns the stage moved to, or null if already terminal.
 * Note: the caller owns any gating (e.g. the detail page's "all items checked" verify gate).
 */
export async function advanceReceiving(
  invoice: PurchaseInvoice,
  memberId: string | null,
  now: () => string = () => new Date().toISOString(),
): Promise<ReceivingStatus | null> {
  const next = nextReceivingStage(invoice.receiving_status);
  if (!next) return null;
  const ts = now();
  await updatePurchaseInvoice(invoice._localId, advanceReceivingPatch(next, () => ts));
  await createTripActivity({
    trip_id: invoice.trip_id,
    member_id: memberId,
    kind: next === "received" ? "arrived" : "note",
    note:
      next === "received"
        ? `Parcel received: ${invoice.supplier_name}`
        : `Parcel ${RECEIVING_LABEL[next].toLowerCase()}: ${invoice.supplier_name}`,
    ref_invoice_id: invoice.id ?? null,
    occurred_at: ts,
  });
  return next;
}

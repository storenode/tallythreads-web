import { db } from "@/db";
import type { PurchaseTrip, SyncMeta } from "@/db";
import { createRow, softDeleteRow, updateRow } from "./writeThrough";
import { createTripActivity } from "./activities";

const TABLE = "purchase_trips";

export function createPurchaseTrip(data: Omit<PurchaseTrip, keyof SyncMeta>) {
  return createRow(TABLE, db.purchase_trips, data);
}

/**
 * Clone a trip's PLAN + ROUTE into a fresh `planning` trip — the sanctioned way to redo a
 * terminal (completed/cancelled) trip, since trips don't reopen. Deliberately copies only
 * the plan (title + " (copy)", route, budgets, margin, notes); NOT invoices/items/expenses
 * — those goods belong to the original trip and copying them would double-count landed
 * cost / inventory. Logs a note on the new trip pointing back to the source.
 */
export async function clonePurchaseTrip(
  source: PurchaseTrip,
  memberId: string,
): Promise<PurchaseTrip> {
  const clone = await createPurchaseTrip({
    organization_id: source.organization_id,
    created_by: memberId,
    title: `${source.title} (copy)`,
    status: "planning",
    start_date: null,
    end_date: null,
    route: source.route,
    planned_budget_paise: source.planned_budget_paise,
    estimated_expenses_paise: source.estimated_expenses_paise,
    expense_estimate_source: source.expense_estimate_source,
    expected_margin_pct: source.expected_margin_pct,
    notes: source.notes,
    started_at: null,
    completed_at: null,
  });
  await createTripActivity({
    trip_id: clone.id!,
    member_id: memberId,
    kind: "note",
    note: `Cloned from "${source.title}"`,
    ref_invoice_id: null,
    occurred_at: new Date().toISOString(),
  });
  return clone;
}

export function updatePurchaseTrip(
  localId: string,
  changes: Partial<Omit<PurchaseTrip, keyof SyncMeta>>,
) {
  return updateRow(TABLE, db.purchase_trips, localId, changes);
}

export function deletePurchaseTrip(localId: string) {
  return softDeleteRow(TABLE, db.purchase_trips, localId);
}

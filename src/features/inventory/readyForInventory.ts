import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import type { PurchaseInvoice, PurchaseInvoiceItem } from "@/db";
import { calculateLandedCost } from "@/lib/landedCost";

/**
 * Deliveries' hand-off to Inventory (specs/roadmap/inventory.md §3): every supplier invoice
 * that reached **Ready for Inventory**, with its lines, the quantity actually received and
 * each line's **landed unit cost**. Org-only data (cost) — never shown on store screens.
 *
 * Landed cost is computed per trip over ALL the trip's items and expenses (the same call the
 * trip detail page makes), then read for the ready invoices' lines, so the numbers match the
 * Purchase Trip exactly.
 */

export interface ReadyLine {
  item: PurchaseInvoiceItem;
  /** What Deliveries counted in (falls back to the invoiced quantity). */
  receivedQty: number;
  landedUnitCostPaise: number | null;
}

export interface ReadyInvoice {
  invoice: PurchaseInvoice;
  tripTitle: string;
  lines: ReadyLine[];
}

export function useReadyForInventory(orgId: string | undefined) {
  return useLiveQuery(async (): Promise<ReadyInvoice[]> => {
    if (!orgId) return [];
    const trips = (
      await db.purchase_trips.where("organization_id").equals(orgId).toArray()
    ).filter((t) => !t.deleted_at && t.id);

    const result: ReadyInvoice[] = [];
    for (const trip of trips) {
      const invoices = (
        await db.purchase_invoices.where("trip_id").equals(trip.id!).toArray()
      ).filter((i) => !i.deleted_at);
      const ready = invoices.filter((i) => i.receiving_status === "ready_for_inventory");
      if (!ready.length) continue;

      const invoiceIds = invoices.map((i) => i.id).filter((x): x is string => !!x);
      const items = (
        await db.purchase_invoice_items.where("invoice_id").anyOf(invoiceIds).toArray()
      ).filter((it) => !it.deleted_at && it.quantity > 0);
      const expenses = (
        await db.trip_expenses.where("trip_id").equals(trip.id!).toArray()
      ).filter((e) => !e.deleted_at);
      const totalExpensesPaise = expenses.reduce((s, e) => s + e.amount_paise, 0);

      const landed = items.length
        ? calculateLandedCost(
            items.map((it) => ({
              id: it._localId,
              quantity: it.quantity,
              unitCostPaise: it.unit_cost_paise,
            })),
            totalExpensesPaise,
            "value",
          )
        : null;
      const landedById = new Map((landed?.items ?? []).map((r) => [r.id, r]));

      for (const invoice of ready) {
        result.push({
          invoice,
          tripTitle: trip.title,
          lines: items
            .filter((it) => it.invoice_id === invoice.id)
            .map((item) => ({
              item,
              receivedQty: item.received_quantity ?? item.quantity,
              landedUnitCostPaise: landedById.get(item._localId)?.landedUnitCostPaise ?? null,
            })),
        });
      }
    }
    // Oldest approval first — the order stock is usually processed in.
    return result.sort((a, b) =>
      String(a.invoice.approved_at ?? "").localeCompare(String(b.invoice.approved_at ?? "")),
    );
  }, [orgId]);
}

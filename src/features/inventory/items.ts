import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import type { InventoryItem, SyncMeta } from "@/db";
import {
  createRow,
  updateRow,
  softDeleteRow,
} from "@/features/purchaseTrips/data/writeThrough";

/**
 * Offline-first data access for inventory items (Inventory Phase 2B). Org-only rows (they carry
 * landed cost). Writes go through the shared Dexie + outbox write-through; reads are live Dexie
 * queries. SKUs are never written here — Finalize assigns them server-side (Phase 2C), and the
 * inventory_items_guard trigger rejects client attempts.
 */

const INVENTORY_ITEMS = "inventory_items";

export type NewInventoryItem = Omit<
  InventoryItem,
  keyof SyncMeta | "status" | "sku" | "replaced_by_item_id" | "finalized_at" | "labels_printed"
>;

export function createInventoryItem(data: NewInventoryItem) {
  return createRow(INVENTORY_ITEMS, db.inventory_items, {
    ...data,
    status: "draft",
    sku: null,
    replaced_by_item_id: null,
    finalized_at: null,
    labels_printed: 0,
  });
}

export function updateInventoryItem(
  localId: string,
  changes: Partial<Omit<InventoryItem, keyof SyncMeta | "sku" | "status">>,
) {
  return updateRow(INVENTORY_ITEMS, db.inventory_items, localId, changes);
}

/** Drafts only — a finalized SKU is retired (Phase 2C), never deleted. */
export function deleteInventoryItem(localId: string) {
  return softDeleteRow(INVENTORY_ITEMS, db.inventory_items, localId);
}

/** Active items catalogued from the given invoice lines (live), in creation order. */
export function useItemsForLines(invoiceItemIds: string[]) {
  const key = invoiceItemIds.join(",");
  return useLiveQuery(async () => {
    if (!invoiceItemIds.length) return [] as InventoryItem[];
    return (
      await db.inventory_items.where("source_invoice_item_id").anyOf(invoiceItemIds).toArray()
    ).filter((i) => !i.deleted_at && i.status !== "retired");
    // key captures the id list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Pieces already catalogued per invoice line id — for "12 of 20 catalogued". */
export function cataloguedByLine(items: InventoryItem[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    if (!it.source_invoice_item_id) continue;
    m.set(it.source_invoice_item_id, (m.get(it.source_invoice_item_id) ?? 0) + it.quantity);
  }
  return m;
}

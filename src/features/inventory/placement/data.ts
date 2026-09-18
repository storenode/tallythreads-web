import { db } from "@/db";
import type { StockLocation, SyncMeta } from "@/db";
// Shared offline-first write-through helpers (Dexie + outbox). They live under
// purchaseTrips/data but are generic sync infra reused across modules.
import {
  createRow,
  updateRow,
  softDeleteRow,
} from "@/features/purchaseTrips/data/writeThrough";

const TABLE = "stock_locations";

/** Who owns a placement tree: a store's selling floor, or a warehouse/stock room. Exactly one
 * id is set; the other is null (mirrors the DB one-owner CHECK). See warehouses.md. */
export type PlacementOwner =
  | { store_id: string; warehouse_id: null }
  | { store_id: null; warehouse_id: string };

export function createStockLocation(
  data: Omit<StockLocation, keyof SyncMeta>,
) {
  return createRow(TABLE, db.stock_locations, data);
}

export function updateStockLocation(
  localId: string,
  changes: Partial<Omit<StockLocation, keyof SyncMeta>>,
) {
  return updateRow(TABLE, db.stock_locations, localId, changes);
}

/**
 * Soft-delete a location AND every descendant (cascade), each as its own write-through so the
 * sync engine propagates all deletions. Callers confirm with the user first — see the Placement
 * card's delete dialog (specs/roadmap/stock-placement.md, decision #10).
 */
export async function deleteStockLocationCascade(localId: string): Promise<void> {
  const root = await db.stock_locations.get(localId);
  if (!root) return;

  // Siblings share the same owner (store OR warehouse) as the root.
  const owned = root.store_id
    ? await db.stock_locations.where("store_id").equals(root.store_id).toArray()
    : await db.stock_locations.where("warehouse_id").equals(root.warehouse_id!).toArray();
  const siblings = owned.filter((r) => !r.deleted_at);

  const childrenByParent = new Map<string, StockLocation[]>();
  for (const r of siblings) {
    if (!r.parent_id) continue;
    const list = childrenByParent.get(r.parent_id) ?? [];
    list.push(r);
    childrenByParent.set(r.parent_id, list);
  }

  // BFS from the root over server ids, collecting local ids to soft-delete.
  const toDelete: string[] = [root._localId];
  const queue: string[] = root.id ? [root.id] : [];
  while (queue.length) {
    const parentServerId = queue.shift()!;
    for (const child of childrenByParent.get(parentServerId) ?? []) {
      toDelete.push(child._localId);
      if (child.id) queue.push(child.id);
    }
  }

  for (const lid of toDelete) {
    await softDeleteRow(TABLE, db.stock_locations, lid);
  }
}

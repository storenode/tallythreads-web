import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import type { InventoryCategory, SyncMeta } from "@/db";
import {
  createRow,
  updateRow,
  softDeleteRow,
} from "@/features/purchaseTrips/data/writeThrough";

/**
 * Offline-first data access for store-scoped inventory categories (Inventory phase 1).
 * All writes go through the shared Dexie + outbox write-through; reads are live Dexie
 * queries so a just-added category appears immediately (before the sync push confirms it).
 */

const INVENTORY_CATEGORIES = "inventory_categories";

export function createCategory(data: Omit<InventoryCategory, keyof SyncMeta>) {
  return createRow(INVENTORY_CATEGORIES, db.inventory_categories, data);
}

export function updateCategory(
  localId: string,
  changes: Partial<Omit<InventoryCategory, keyof SyncMeta>>,
) {
  return updateRow(INVENTORY_CATEGORIES, db.inventory_categories, localId, changes);
}

export function deleteCategory(localId: string) {
  return softDeleteRow(INVENTORY_CATEGORIES, db.inventory_categories, localId);
}

/** All active categories for one store (live), sorted by name. */
export function useCategoriesByStore(storeId: string | undefined) {
  return useLiveQuery(async () => {
    if (!storeId) return [] as InventoryCategory[];
    return (
      await db.inventory_categories.where("store_id").equals(storeId).toArray()
    )
      .filter((c) => !c.deleted_at)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [storeId]);
}

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import type { Warehouse, WarehouseStore, SyncMeta } from "@/db";
import {
  createRow,
  updateRow,
  softDeleteRow,
} from "@/features/purchaseTrips/data/writeThrough";

/**
 * Offline-first data access for Warehouses / stock rooms (see specs/roadmap/warehouses.md).
 * All writes go through the shared Dexie + outbox write-through; reads are live Dexie queries so
 * a just-created stock room appears immediately (before the sync push confirms it server-side).
 */

const WAREHOUSES = "warehouses";
const WAREHOUSE_STORES = "warehouse_stores";

// ─── Warehouses ──────────────────────────────────────────────────────

export function createWarehouse(data: Omit<Warehouse, keyof SyncMeta>) {
  return createRow(WAREHOUSES, db.warehouses, data);
}

export function updateWarehouse(
  localId: string,
  changes: Partial<Omit<Warehouse, keyof SyncMeta>>,
) {
  return updateRow(WAREHOUSES, db.warehouses, localId, changes);
}

/** Soft-delete a warehouse AND its store attachments and its own placement locations, each as
 * its own write-through so every deletion syncs. Callers confirm with the user first. */
export async function deleteWarehouseCascade(localId: string): Promise<void> {
  const wh = await db.warehouses.get(localId);
  if (!wh || !wh.id) {
    if (wh) await softDeleteRow(WAREHOUSES, db.warehouses, localId);
    return;
  }
  const links = (
    await db.warehouse_stores.where("warehouse_id").equals(wh.id).toArray()
  ).filter((r) => !r.deleted_at);
  for (const link of links) {
    await softDeleteRow(WAREHOUSE_STORES, db.warehouse_stores, link._localId);
  }
  const locations = (
    await db.stock_locations.where("warehouse_id").equals(wh.id).toArray()
  ).filter((r) => !r.deleted_at);
  for (const loc of locations) {
    await softDeleteRow("stock_locations", db.stock_locations, loc._localId);
  }
  await softDeleteRow(WAREHOUSES, db.warehouses, localId);
}

/** All active warehouses for one org (live). */
export function useWarehousesByOrg(organizationId: string | undefined) {
  return useLiveQuery(async () => {
    if (!organizationId) return [] as Warehouse[];
    return (
      await db.warehouses.where("organization_id").equals(organizationId).toArray()
    )
      .filter((w) => !w.deleted_at)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }, [organizationId]);
}

/** One warehouse by its server id (live). */
export function useWarehouse(warehouseId: string | undefined) {
  return useLiveQuery(async () => {
    if (!warehouseId) return undefined;
    const rows = await db.warehouses.where("id").equals(warehouseId).toArray();
    return rows.find((w) => !w.deleted_at);
  }, [warehouseId]);
}

// ─── Attachments (warehouse ↔ store) ─────────────────────────────────

/** Attach a warehouse to a store (idempotent among active links). */
export async function attachStore(
  warehouseId: string,
  storeId: string,
): Promise<void> {
  const existing = (
    await db.warehouse_stores.where("warehouse_id").equals(warehouseId).toArray()
  ).find((l) => l.store_id === storeId && !l.deleted_at);
  if (existing) return;
  await createRow(WAREHOUSE_STORES, db.warehouse_stores, {
    warehouse_id: warehouseId,
    store_id: storeId,
  });
}

/** Detach a store from a warehouse (soft-delete the link). */
export async function detachStore(
  warehouseId: string,
  storeId: string,
): Promise<void> {
  const links = (
    await db.warehouse_stores.where("warehouse_id").equals(warehouseId).toArray()
  ).filter((l) => l.store_id === storeId && !l.deleted_at);
  for (const link of links) {
    await softDeleteRow(WAREHOUSE_STORES, db.warehouse_stores, link._localId);
  }
}

/** Active links for one warehouse (live). */
export function useWarehouseLinks(warehouseId: string | undefined) {
  return useLiveQuery(async () => {
    if (!warehouseId) return [] as WarehouseStore[];
    return (
      await db.warehouse_stores.where("warehouse_id").equals(warehouseId).toArray()
    ).filter((l) => !l.deleted_at);
  }, [warehouseId]);
}

export interface WarehouseWithStores {
  warehouse: Warehouse;
  storeIds: string[];
}

/** Every warehouse in the org with the store ids it's attached to (live) — backs the mapping
 * view. See specs/roadmap/warehouses.md §3.5. */
export function useOrgWarehouseMap(organizationId: string | undefined) {
  return useLiveQuery(async () => {
    if (!organizationId) return [] as WarehouseWithStores[];
    const warehouses = (
      await db.warehouses.where("organization_id").equals(organizationId).toArray()
    )
      .filter((w) => !w.deleted_at)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const result: WarehouseWithStores[] = [];
    for (const warehouse of warehouses) {
      const links = warehouse.id
        ? (
            await db.warehouse_stores
              .where("warehouse_id")
              .equals(warehouse.id)
              .toArray()
          ).filter((l) => !l.deleted_at)
        : [];
      result.push({ warehouse, storeIds: links.map((l) => l.store_id) });
    }
    return result;
  }, [organizationId]);
}

/** Active links for one store (live) — which warehouses this store draws from. */
export function useStoreWarehouseLinks(storeId: string | undefined) {
  return useLiveQuery(async () => {
    if (!storeId) return [] as WarehouseStore[];
    return (
      await db.warehouse_stores.where("store_id").equals(storeId).toArray()
    ).filter((l) => !l.deleted_at);
  }, [storeId]);
}

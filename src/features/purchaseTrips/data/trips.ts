import { db } from "@/db";
import type { PurchaseTrip, SyncMeta } from "@/db";
import { createRow, softDeleteRow, updateRow } from "./writeThrough";

const TABLE = "purchase_trips";

export function createPurchaseTrip(data: Omit<PurchaseTrip, keyof SyncMeta>) {
  return createRow(TABLE, db.purchase_trips, data);
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

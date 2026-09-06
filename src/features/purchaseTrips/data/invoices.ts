import { db } from "@/db";
import type { PurchaseInvoice, SyncMeta } from "@/db";
import { createRow, softDeleteRow, updateRow } from "./writeThrough";

const TABLE = "purchase_invoices";

export function createPurchaseInvoice(
  data: Omit<PurchaseInvoice, keyof SyncMeta>,
) {
  return createRow(TABLE, db.purchase_invoices, data);
}

export function updatePurchaseInvoice(
  localId: string,
  changes: Partial<Omit<PurchaseInvoice, keyof SyncMeta>>,
) {
  return updateRow(TABLE, db.purchase_invoices, localId, changes);
}

export function deletePurchaseInvoice(localId: string) {
  return softDeleteRow(TABLE, db.purchase_invoices, localId);
}

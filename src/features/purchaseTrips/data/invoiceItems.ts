import { db } from "@/db";
import type { PurchaseInvoiceItem, SyncMeta } from "@/db";
import { createRow, softDeleteRow, updateRow } from "./writeThrough";

const TABLE = "purchase_invoice_items";

export function createPurchaseInvoiceItem(
  data: Omit<PurchaseInvoiceItem, keyof SyncMeta>,
) {
  return createRow(TABLE, db.purchase_invoice_items, data);
}

export function updatePurchaseInvoiceItem(
  localId: string,
  changes: Partial<Omit<PurchaseInvoiceItem, keyof SyncMeta>>,
) {
  return updateRow(TABLE, db.purchase_invoice_items, localId, changes);
}

export function deletePurchaseInvoiceItem(localId: string) {
  return softDeleteRow(TABLE, db.purchase_invoice_items, localId);
}

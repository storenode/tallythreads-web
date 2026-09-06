import type { SyncMeta } from "./types";

export interface PurchaseInvoice extends SyncMeta {
  id?: string;
  trip_id: string;
  supplier_name: string;
  supplier_gstin: string | null;
  supplier_invoice_no: string | null;
  invoice_date: string | null;
  // data-driven recipe OR a coded plugin key — at most one is set.
  margin_config: Record<string, unknown> | null;
  margin_plugin_id: string | null;
  notes: string | null;
}

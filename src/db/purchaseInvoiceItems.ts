import type { SyncMeta } from "./types";

export interface PurchaseInvoiceItem extends SyncMeta {
  id?: string;
  invoice_id: string;
  description: string;
  hsn_code: string | null;
  quantity: number;
  unit_cost_paise: number;
  is_trending: boolean;
}

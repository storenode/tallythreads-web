import type { SyncMeta } from "./types";

export interface PurchaseInvoiceItem extends SyncMeta {
  id?: string;
  invoice_id: string;
  description: string;
  hsn_code: string | null;
  quantity: number;
  unit_cost_paise: number;
  is_trending: boolean;
  // Line-level goods check (Deliveries module). null = not yet checked; a value is the actual
  // received quantity (may differ from `quantity` = shortage/excess). Set while the parent
  // invoice is in the `received` stage; all items must be set before it can be verified.
  received_quantity: number | null;
  receiving_note: string | null;
}

import type { SyncMeta } from "./types";

export type InventoryItemStatus = "draft" | "finalized" | "retired";

/**
 * One row per future SKU (Inventory Phase 2, specs/roadmap/inventory.md §4, §10): a
 * Ready-for-Inventory invoice line split by colour × size × store. Org-only (carries cost).
 * `store_id` null = unallocated. `sku` is assigned server-side at Finalize (Phase 2C); once
 * set, store / category / colour / size are frozen (retire + reissue instead).
 */
export interface InventoryItem extends SyncMeta {
  id?: string;
  organization_id: string;
  source_invoice_item_id: string | null;
  store_id: string | null;
  category_id: string | null;
  category_code: string;
  name: string;
  color: string;
  size: string;
  quantity: number;
  mrp_paise: number;
  landed_unit_cost_paise: number | null;
  status: InventoryItemStatus;
  sku: string | null;
  replaced_by_item_id: string | null;
  finalized_at: string | null;
  labels_printed: number;
  created_by: string | null;
}

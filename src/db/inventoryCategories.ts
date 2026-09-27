import type { SyncMeta } from "./types";

/** A store-scoped product category/department (Sarees, Kids, …). Each store defines its own —
 * an org can have "Kids" in one store and not another. A {@link StockLocation} may be tagged
 * with one via `category_id`. `next_sequence` is the per-(store,category) counter reserved for
 * the later SKU phase. */
export interface InventoryCategory extends SyncMeta {
  id?: string;
  organization_id: string;
  store_id: string;
  name: string;
  /** SKU category segment (SAR). Assigned/normalised server-side so one name ↔ one code
   * across the org (the inventory_categories_assign_code trigger); the client sends its best
   * suggestion. Optional only for rows cached before Phase 2A. */
  code?: string;
  next_sequence: number;
}

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
  next_sequence: number;
}

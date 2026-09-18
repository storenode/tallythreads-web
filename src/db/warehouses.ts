import type { SyncMeta } from "./types";

/** Type of storage space a warehouse represents. A label/aid, not behaviour —
 * see specs/roadmap/warehouses.md. */
export type WarehouseType = "backyard" | "stockroom" | "godown" | "other";

/** An org-owned storage space (backyard / understairs / stockroom / godown) that holds
 * stock outside a store's selling floor. NOT a retail outlet — it attaches to one or more
 * stores via {@link WarehouseStore}, and its internal placement (shelves/zones/racks) reuses
 * the `stock_locations` tree via `warehouse_id`. See specs/roadmap/warehouses.md. */
export interface Warehouse extends SyncMeta {
  id?: string;
  organization_id: string;
  name: string;
  warehouse_type: WarehouseType;
  note: string | null;
  sort_order: number;
}

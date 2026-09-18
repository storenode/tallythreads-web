import type { SyncMeta } from "./types";

/** Many-to-many link between a warehouse and the stores it serves / sits at. A central godown
 * links many stores; a store's own backyard links exactly one; an unattached org warehouse
 * links none. Drives which warehouse locations a store sees in the intake picker.
 * Unique on (warehouse_id, store_id) among non-deleted rows. See specs/roadmap/warehouses.md. */
export interface WarehouseStore extends SyncMeta {
  id?: string;
  warehouse_id: string;
  store_id: string;
}

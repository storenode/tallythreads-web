import type { SyncMeta } from "./types";

export type StockMovementKind =
  | "finalize"
  | "reissue"
  | "dispatch"
  | "receive"
  | "shortage"
  | "excess"
  | "place"
  | "move"
  | "adjust";

export type StockSideKind = "org" | "transit" | "store";

/**
 * One line of the append-only stock log (specs/roadmap/inventory.md §8). Quantities on hand are
 * derived from these rows (the `stock_levels` view / `store_stock` RPC), never edited. The client
 * only ever *creates* `place` / `move` rows inside one store (offline, via the outbox); every
 * other kind is written server-side by the inventory RPCs. Push-only in the sync engine — the
 * store's view of stock comes from `store_stock`, so the log itself is never pulled.
 */
export interface StockMovement extends SyncMeta {
  id?: string;
  organization_id: string;
  item_id: string;
  quantity: number;
  kind: StockMovementKind;
  from_kind: StockSideKind | null;
  from_store_id: string | null;
  from_warehouse_id: string | null;
  from_location_id: string | null;
  to_kind: StockSideKind | null;
  to_store_id: string | null;
  to_warehouse_id: string | null;
  to_location_id: string | null;
  transfer_id: string | null;
  reason: string | null;
  member_id: string | null;
  created_at: string;
}

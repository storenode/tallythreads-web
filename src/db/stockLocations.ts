import type { SyncMeta } from "./types";

/** A node in a store's placement tree (Stock Placement module — see
 * specs/roadmap/stock-placement.md). floor/section are containers, zone/rack are
 * leaf placements; `parent_id` nests them. Every level is optional. */
export type PlacementType = "floor" | "section" | "zone" | "rack";

/** The 8 compass directions a rack code can start with. */
export type RackDirection =
  | "N"
  | "S"
  | "E"
  | "W"
  | "NE"
  | "NW"
  | "SE"
  | "SW";

/** Constrained palette for colour-coding a location — a token (not hex), theme-aware, and
 * mappable to buyable colored shelf labels. Colour is an aid, always shown with the code. */
export type PlacementColor =
  | "red"
  | "amber"
  | "green"
  | "teal"
  | "blue"
  | "violet"
  | "pink"
  | "slate";

export interface StockLocation extends SyncMeta {
  id?: string;
  /** Owning store, when this location sits in a store's selling floor. Exactly one of
   * store_id / warehouse_id is set (DB CHECK stock_locations_one_owner). */
  store_id: string | null;
  /** Owning warehouse, when this location sits inside a warehouse/stock room. Exactly one of
   * store_id / warehouse_id is set. See specs/roadmap/warehouses.md. */
  warehouse_id: string | null;
  /** Container this sits under (same owner); null = top level. */
  parent_id: string | null;
  placement_type: PlacementType;
  /** The identifier — a typed name (floor/section/zone) or the rack code "E-03-02". */
  code: string;
  label: string | null;
  // Rack builder inputs (null unless placement_type === 'rack'). Kept as provenance:
  // `code` is the source of truth and may be hand-edited away from these.
  direction: RackDirection | null;
  rack_row: string | null;
  rack_col: string | null;
  /** Reserved for a future visual planogram (shape/x/y/w/h); unused at launch. */
  layout: Record<string, unknown> | null;
  /** Optional palette colour for quick visual identification (null = neutral/none). */
  color: PlacementColor | null;
  sort_order: number;
}

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

export interface StockLocation extends SyncMeta {
  id?: string;
  store_id: string;
  /** Container this sits under (same store); null = top level. */
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
  sort_order: number;
}

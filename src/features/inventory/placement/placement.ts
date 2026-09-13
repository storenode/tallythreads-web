import type { PlacementType, RackDirection, StockLocation } from "@/db";

/** Pure helpers for the Stock Placement tree — see specs/roadmap/stock-placement.md. */

export const RACK_DIRECTIONS: RackDirection[] = [
  "N",
  "S",
  "E",
  "W",
  "NE",
  "NW",
  "SE",
  "SW",
];

interface PlacementTypeMeta {
  label: string;
  icon: string;
  /** Containers (floor/section) can hold children; leaves (zone/rack) cannot. */
  container: boolean;
}

export const PLACEMENT_META: Record<PlacementType, PlacementTypeMeta> = {
  floor: { label: "Floor", icon: "🏢", container: true },
  section: { label: "Section", icon: "🏷️", container: true },
  zone: { label: "Zone", icon: "👕", container: false },
  rack: { label: "Rack", icon: "▦", container: false },
};

export const isContainer = (t: PlacementType): boolean =>
  PLACEMENT_META[t].container;

/** Left-pad a positive integer to a 2-digit string ("3" → "03"). */
export function pad2(value: string | number): string {
  const n = Math.max(0, Math.trunc(Number(value) || 0));
  return String(n).padStart(2, "0");
}

/** Generate a rack code from its parts: E + 03 + 02 → "E-03-02". */
export function rackCode(
  direction: RackDirection,
  row: string | number,
  col: string | number,
): string {
  return `${direction}-${pad2(row)}-${pad2(col)}`;
}

/** A location plus its children, for rendering the tree. */
export interface PlacementNode extends StockLocation {
  children: PlacementNode[];
}

const byOrder = (a: StockLocation, b: StockLocation) =>
  a.sort_order - b.sort_order || a.code.localeCompare(b.code);

/**
 * Build the placement forest from a flat list (active rows only). Top-level nodes are those
 * with no parent (or whose parent is missing/deleted). Children sort by sort_order then code.
 */
export function buildTree(rows: StockLocation[]): PlacementNode[] {
  const active = rows.filter((r) => !r.deleted_at);
  const byId = new Map<string, PlacementNode>();
  for (const r of active) {
    if (r.id) byId.set(r.id, { ...r, children: [] });
  }
  const roots: PlacementNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (nodes: PlacementNode[]) => {
    nodes.sort(byOrder);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export interface DescendantCounts {
  floors: number;
  sections: number;
  zones: number;
  racks: number;
  total: number;
}

/** Count all descendants of a node, grouped by type (for the cascade-delete confirmation). */
export function descendantCounts(node: PlacementNode): DescendantCounts {
  const acc: DescendantCounts = {
    floors: 0,
    sections: 0,
    zones: 0,
    racks: 0,
    total: 0,
  };
  const walk = (n: PlacementNode) => {
    for (const child of n.children) {
      acc.total += 1;
      if (child.placement_type === "floor") acc.floors += 1;
      else if (child.placement_type === "section") acc.sections += 1;
      else if (child.placement_type === "zone") acc.zones += 1;
      else if (child.placement_type === "rack") acc.racks += 1;
      walk(child);
    }
  };
  walk(node);
  return acc;
}

/** Human phrase for a cascade delete, e.g. "2 racks and 1 zone". Empty string if childless. */
export function describeDescendants(counts: DescendantCounts): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(counts.floors, "floor", "floors");
  add(counts.sections, "section", "sections");
  add(counts.racks, "rack", "racks");
  add(counts.zones, "zone", "zones");
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

import type { PlacementType, RackDirection } from "@/db";
import { createStockLocation } from "@/features/inventory/placement/data";
import { pad2 } from "@/features/inventory/placement/placement";

/**
 * Demo stock-placement: prefill templates + the real-method creator, shared by the three
 * demo forms (independent/chain/franchise). Placement is defined per store in the demo form
 * (prefilled, editable) and created on submit via the app's real `createStockLocation` write
 * path — so the demo exercises the same code a store owner uses, and the data shows on the
 * store edit page immediately. See specs/roadmap/stock-placement.md.
 */

export interface DemoPlacementNode {
  type: PlacementType;
  code: string;
  label?: string;
  // rack only:
  direction?: RackDirection;
  row?: number;
  col?: number;
  children?: DemoPlacementNode[];
}

// ─── Prefill templates ───────────────────────────────────────────────

/** Expand a rack grid into individual rack nodes, e.g. E-01-01 … E-02-04. */
function rackGrid(
  direction: RackDirection,
  rows: number,
  cols: number,
): DemoPlacementNode[] {
  const out: DemoPlacementNode[] = [];
  for (let r = 1; r <= rows; r++)
    for (let c = 1; c <= cols; c++)
      out.push({
        type: "rack",
        code: `${direction}-${pad2(r)}-${pad2(c)}`,
        direction,
        row: r,
        col: c,
      });
  return out;
}

/** Traditional folded-stock shop: product-type sections with rack grids + a display zone. */
const sectionsWithRacks = (): DemoPlacementNode[] => [
  { type: "section", code: "Sarees", children: rackGrid("E", 2, 4) },
  { type: "section", code: "Dress Material", children: rackGrid("W", 1, 3) },
  {
    type: "section",
    code: "Readymade",
    children: [{ type: "zone", code: "Readymade display" }, ...rackGrid("N", 1, 2)],
  },
];

/** Bigger showroom: two floors, each with brand/gender sections holding racks + a zone. */
const multiFloor = (): DemoPlacementNode[] => [
  {
    type: "floor",
    code: "Ground",
    children: [
      { type: "section", code: "Men's", children: rackGrid("E", 1, 3) },
      {
        type: "section",
        code: "Women's",
        children: [{ type: "zone", code: "Saree display" }, ...rackGrid("W", 1, 2)],
      },
    ],
  },
  {
    type: "floor",
    code: "First",
    children: [
      { type: "section", code: "Kids", children: rackGrid("N", 1, 2) },
      {
        type: "section",
        code: "Home Furnishing",
        children: [{ type: "zone", code: "Curtains wall" }],
      },
    ],
  },
];

/** Simpler branch: a flat set of racks at top level plus a front display zone. */
const flatRacks = (): DemoPlacementNode[] => [
  ...rackGrid("E", 1, 4),
  { type: "zone", code: "Front display" },
];

// ── Bandrip streetwear boutique (the franchise demo) ────────────────
// Modelled on the real Bandrip showroom: everything is HUNG and located by named display
// zones — wall rails, rolling racks, and the "The bandits" grid wall for caps/sunglasses,
// plus a small back-store rack section. Bandrip runs the SAME brand-standard layout in every
// branch, so this one template is applied to every franchise store (see demoPlacementFor).
const bandripStandard = (): DemoPlacementNode[] => [
  { type: "zone", code: "New drops", label: "New arrivals · entrance display" },
  { type: "zone", code: "The bandits", label: "Caps, sunglasses & bandanas wall" },
  { type: "zone", code: "Jackets & hoodies rail" },
  { type: "zone", code: "Oversized tees rack" },
  { type: "zone", code: "Bottoms rack", label: "Cargos, wide-leg & jeans" },
  { type: "section", code: "Stockroom", children: rackGrid("N", 1, 3) },
];

export type DemoOrgType = "independent" | "chain" | "franchise";

// Per-type plan for independent/chain, assigned to stores by index (creation order); a store
// beyond the list is left empty on purpose — the "placement is optional" demo case. Franchise
// (Bandrip) is brand-standardized, so it ignores the index and uses one layout everywhere.
const PLAN: Record<"independent" | "chain", Array<() => DemoPlacementNode[]>> = {
  independent: [sectionsWithRacks],
  chain: [multiFloor, flatRacks],
};

/** The prefilled placement tree for a store, by org type + its index in the store list. */
export function demoPlacementFor(
  orgType: DemoOrgType,
  storeIndex: number,
): DemoPlacementNode[] {
  // Bandrip runs the same brand-standard layout in every branch.
  if (orgType === "franchise") return bandripStandard();
  const build = PLAN[orgType][storeIndex];
  return build ? build() : [];
}

// ─── Create (real write-through) ─────────────────────────────────────

/**
 * Create a store's placement tree via the app's real `createStockLocation` path (Dexie +
 * outbox), parents before children so `parent_id` resolves. Runs after the store exists.
 */
export async function createStorePlacements(
  storeId: string,
  nodes: DemoPlacementNode[],
): Promise<void> {
  const createLevel = async (
    level: DemoPlacementNode[],
    parentId: string | null,
  ): Promise<void> => {
    let i = 0;
    for (const n of level) {
      const isRack = n.type === "rack";
      const created = await createStockLocation({
        store_id: storeId,
        parent_id: parentId,
        placement_type: n.type,
        code: n.code,
        label: n.label ?? null,
        direction: isRack ? (n.direction ?? null) : null,
        rack_row: isRack && n.row != null ? pad2(n.row) : null,
        rack_col: isRack && n.col != null ? pad2(n.col) : null,
        layout: null,
        sort_order: i++,
      });
      if (n.children?.length) await createLevel(n.children, created.id ?? null);
    }
  };
  await createLevel(nodes, null);
}

// ─── Summary (for the demo store cards) ──────────────────────────────

/** Count nodes by type across the whole tree. */
function countByType(nodes: DemoPlacementNode[]): Record<PlacementType, number> {
  const acc: Record<PlacementType, number> = {
    floor: 0,
    section: 0,
    zone: 0,
    rack: 0,
  };
  const walk = (list: DemoPlacementNode[]) => {
    for (const n of list) {
      acc[n.type] += 1;
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return acc;
}

function formatCounts(c: Record<PlacementType, number>): string {
  const parts: string[] = [];
  const add = (n: number, one: string, many: string) => {
    if (n > 0) parts.push(`${n} ${n === 1 ? one : many}`);
  };
  add(c.floor, "floor", "floors");
  add(c.section, "section", "sections");
  add(c.rack, "rack", "racks");
  add(c.zone, "zone", "zones");
  return parts.length ? parts.join(" · ") : "none";
}

/** One-line summary of a placement tree, e.g. "2 sections · 3 racks · 1 zone" or "none". */
export function summarizePlacement(nodes: DemoPlacementNode[]): string {
  return formatCounts(countByType(nodes));
}

/** One-line summary from flat stock_locations rows (for the demo store cards). */
export function summarizeRows(
  rows: readonly { placement_type: PlacementType }[],
): string {
  const c: Record<PlacementType, number> = {
    floor: 0,
    section: 0,
    zone: 0,
    rack: 0,
  };
  for (const r of rows) c[r.placement_type] += 1;
  return formatCounts(c);
}

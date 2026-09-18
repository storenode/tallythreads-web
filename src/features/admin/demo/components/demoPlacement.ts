import type { PlacementColor, PlacementType, RackDirection } from "@/db";
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
  color?: PlacementColor;
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
  color?: PlacementColor,
): DemoPlacementNode[] {
  const out: DemoPlacementNode[] = [];
  for (let r = 1; r <= rows; r++)
    for (let c = 1; c <= cols; c++)
      out.push({
        type: "rack",
        code: `${direction}-${pad2(r)}-${pad2(c)}`,
        color,
        direction,
        row: r,
        col: c,
      });
  return out;
}

/** Traditional folded-stock shop: product-type sections with rack grids + a display zone. */
const sectionsWithRacks = (): DemoPlacementNode[] => [
  { type: "section", code: "Sarees", color: "red", children: rackGrid("E", 2, 4, "red") },
  { type: "section", code: "Dress Material", color: "blue", children: rackGrid("W", 1, 3, "blue") },
  {
    type: "section",
    code: "Readymade",
    color: "green",
    children: [
      { type: "zone", code: "Readymade display", color: "green" },
      ...rackGrid("N", 1, 2, "green"),
    ],
  },
];

/** Bigger showroom: two floors, each with brand/gender sections holding racks + a zone. */
const multiFloor = (): DemoPlacementNode[] => [
  {
    type: "floor",
    code: "Ground",
    color: "slate",
    children: [
      { type: "section", code: "Men's", color: "blue", children: rackGrid("E", 1, 3, "blue") },
      {
        type: "section",
        code: "Women's",
        color: "pink",
        children: [
          { type: "zone", code: "Saree display", color: "pink" },
          ...rackGrid("W", 1, 2, "pink"),
        ],
      },
    ],
  },
  {
    type: "floor",
    code: "First",
    color: "slate",
    children: [
      { type: "section", code: "Kids", color: "amber", children: rackGrid("N", 1, 2, "amber") },
      {
        type: "section",
        code: "Home Furnishing",
        color: "teal",
        children: [{ type: "zone", code: "Curtains wall", color: "teal" }],
      },
    ],
  },
];

/** Simpler branch: a flat set of racks at top level plus a front display zone. */
const flatRacks = (): DemoPlacementNode[] => [
  ...rackGrid("E", 1, 4, "blue"),
  { type: "zone", code: "Front display", color: "green" },
];

// ── Bandrip streetwear boutique (the franchise demo) ────────────────
// Modelled on the real Bandrip showroom: everything is HUNG and located by named display
// zones — wall rails, rolling racks, and the "The bandits" grid wall for caps/sunglasses,
// plus a small back-store rack section. Bandrip runs the SAME brand-standard layout in every
// branch, so this one template is applied to every franchise store (see demoPlacementFor).
const bandripStandard = (): DemoPlacementNode[] => [
  { type: "zone", code: "New drops", label: "New arrivals · entrance display", color: "amber" },
  { type: "zone", code: "The bandits", label: "Caps, sunglasses & bandanas wall", color: "violet" },
  { type: "zone", code: "Jackets & hoodies rail", color: "blue" },
  { type: "zone", code: "Oversized tees rack", color: "teal" },
  { type: "zone", code: "Bottoms rack", label: "Cargos, wide-leg & jeans", color: "slate" },
  { type: "section", code: "Stockroom", color: "green", children: rackGrid("N", 1, 3, "green") },
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
        warehouse_id: null,
        parent_id: parentId,
        placement_type: n.type,
        code: n.code,
        label: n.label ?? null,
        direction: isRack ? (n.direction ?? null) : null,
        rack_row: isRack && n.row != null ? pad2(n.row) : null,
        rack_col: isRack && n.col != null ? pad2(n.col) : null,
        layout: null,
        color: n.color ?? null,
        sort_order: i++,
      });
      if (n.children?.length) await createLevel(n.children, created.id ?? null);
    }
  };
  await createLevel(nodes, null);
}


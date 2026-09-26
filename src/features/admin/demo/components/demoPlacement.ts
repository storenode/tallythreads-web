import type { PlacementColor, PlacementType, RackDirection } from "@/db";
import { supabase } from "@/lib/supabaseClient";
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
  /** Store category this node holds (e.g. "Sarees") — resolved to `category_id` against the
   * store's seeded demo categories at create time; unmatched names are left untagged. */
  category?: string;
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
  { type: "section", code: "Sarees", color: "red", category: "Sarees", children: rackGrid("E", 2, 4, "red") },
  { type: "section", code: "Dress Material", color: "blue", category: "Dress Materials", children: rackGrid("W", 1, 3, "blue") },
  {
    type: "section",
    code: "Readymade",
    color: "green",
    category: "Readymade",
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
      { type: "section", code: "Men's", color: "blue", category: "Men's Wear", children: rackGrid("E", 1, 3, "blue") },
      {
        type: "section",
        code: "Women's",
        color: "pink",
        category: "Women's Wear",
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
      { type: "section", code: "Kids", color: "amber", category: "Kids Wear", children: rackGrid("N", 1, 2, "amber") },
      {
        type: "section",
        code: "Home Furnishing",
        color: "teal",
        category: "Home Furnishing",
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
  { type: "zone", code: "New drops", label: "New arrivals · entrance display", color: "amber", category: "Streetwear" },
  { type: "zone", code: "The bandits", label: "Caps, sunglasses & bandanas wall", color: "violet", category: "Accessories" },
  { type: "zone", code: "Jackets & hoodies rail", color: "blue", category: "Streetwear" },
  { type: "zone", code: "Oversized tees rack", color: "teal", category: "Streetwear" },
  { type: "zone", code: "Bottoms rack", label: "Cargos, wide-leg & jeans", color: "slate", category: "Streetwear" },
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

// ─── Create (direct server insert) ───────────────────────────────────

/**
 * Insert one stock_locations row directly into Supabase (platform-admin RLS),
 * returning its id. Demo seeding uses direct server inserts — like the
 * purchase-trip seeder — rather than the app's offline-first Dexie/outbox path,
 * so a freshly created demo's placements are immediately, reliably on the server
 * (visible on any device, no sync wait). Shared with the warehouse seeder.
 */
export async function insertDemoStockLocation(row: {
  store_id: string | null;
  warehouse_id: string | null;
  parent_id: string | null;
  placement_type: PlacementType;
  code: string;
  label: string | null;
  direction: RackDirection | null;
  rack_row: string | null;
  rack_col: string | null;
  color: PlacementColor | null;
  sort_order: number;
  category_id?: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from("stock_locations")
    .insert({ ...row, layout: null })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Create a store's placement tree via direct server inserts, parents before
 * children so `parent_id` resolves. Runs after the store exists.
 */
export async function createStorePlacements(
  storeId: string,
  nodes: DemoPlacementNode[],
  /** The store's category ids by name (from seedDemoStoreCategories), for `node.category`. */
  categoryIds: ReadonlyMap<string, string> = new Map(),
): Promise<void> {
  const createLevel = async (
    level: DemoPlacementNode[],
    parentId: string | null,
  ): Promise<void> => {
    let i = 0;
    for (const n of level) {
      const isRack = n.type === "rack";
      const id = await insertDemoStockLocation({
        store_id: storeId,
        warehouse_id: null,
        parent_id: parentId,
        placement_type: n.type,
        code: n.code,
        label: n.label ?? null,
        direction: isRack ? (n.direction ?? null) : null,
        rack_row: isRack && n.row != null ? pad2(n.row) : null,
        rack_col: isRack && n.col != null ? pad2(n.col) : null,
        color: n.color ?? null,
        sort_order: i++,
        category_id: (n.category && categoryIds.get(n.category)) || null,
      });
      if (n.children?.length) await createLevel(n.children, id);
    }
  };
  await createLevel(nodes, null);
}


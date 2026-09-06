// Purchase-Trip margin / MRP engine (M4). Pure, integer-paise. Reuses the settlement
// engine's hybrid recipe-or-plugin shape (see specs/reference/franchise-settlement.md
// §4.5): each invoice resolves its margin EITHER from a data-driven recipe OR a coded
// plugin selected by string key from a fixed whitelist registry — NEVER by eval'ing
// stored data. Design: specs/roadmap/purchase-trips.md §7.
//
// margin is a fraction (0.20 = 20%). suggestedMrp = landedUnitCost × (1 + margin).

export interface MarginItemInput {
  landedUnitCostPaise: number;
  isTrending: boolean;
}

/** Data-driven margin recipe (the default path — a new agreement is just a config row). */
export type MarginRecipe =
  | { type: "flat"; pct: number }
  | { type: "trending"; basePct: number; trendingPct: number };

/** Coded plugin (the fallback path for pricing a recipe can't express). */
export interface MarginPlugin {
  id: string;
  version: string;
  marginFor(item: MarginItemInput): number;
}

export interface MarginConfig {
  /** Exactly one of `recipe` or `pluginId` must be set (mirrors settlement_rules). */
  recipe?: MarginRecipe;
  pluginId?: string;
}

// ── Whitelist registry (the reflection substitute; string key → plugin) ──
// Example plugin only; add real coded plugins here + an off-hours redeploy when a
// contract truly can't be a recipe. Never resolve a plugin any other way.
const tieredBandV1: MarginPlugin = {
  id: "tiered-band-v1",
  version: "1.0.0",
  // Costlier stock (> ₹500 landed) carries a higher markup than cheap staples.
  marginFor: (item) => (item.landedUnitCostPaise > 50_000 ? 0.5 : 0.25),
};

const PLUGIN_REGISTRY: Record<string, MarginPlugin> = {
  [tieredBandV1.id]: tieredBandV1,
};

function evalRecipe(recipe: MarginRecipe, item: MarginItemInput): number {
  switch (recipe.type) {
    case "flat":
      if (!Number.isFinite(recipe.pct) || recipe.pct < 0)
        throw new RangeError("flat margin pct must be a non-negative number");
      return recipe.pct;
    case "trending": {
      const { basePct, trendingPct } = recipe;
      if (
        !Number.isFinite(basePct) ||
        basePct < 0 ||
        !Number.isFinite(trendingPct) ||
        trendingPct < 0
      )
        throw new RangeError("trending margin pcts must be non-negative numbers");
      return item.isTrending ? trendingPct : basePct;
    }
    default: {
      // Exhaustive guard: an unknown recipe type is a hard error, never a silent 0.
      const _never: never = recipe;
      throw new RangeError(`unknown margin recipe type: ${JSON.stringify(_never)}`);
    }
  }
}

/** Resolve the margin fraction for an item from its invoice's config. */
export function resolveMarginPct(item: MarginItemInput, config: MarginConfig): number {
  const hasRecipe = config.recipe != null;
  const hasPlugin = config.pluginId != null;
  if (hasRecipe === hasPlugin)
    throw new RangeError("exactly one of recipe or pluginId must be set");

  if (hasRecipe) return evalRecipe(config.recipe!, item);

  const plugin = PLUGIN_REGISTRY[config.pluginId!];
  if (!plugin)
    throw new RangeError(`unknown margin pluginId: ${config.pluginId}`); // whitelist only
  return plugin.marginFor(item);
}

/** Suggested MRP in paise = round(landedUnitCost × (1 + margin)). */
export function suggestedMrpPaise(item: MarginItemInput, config: MarginConfig): number {
  if (!Number.isInteger(item.landedUnitCostPaise) || item.landedUnitCostPaise < 0)
    throw new RangeError("landedUnitCostPaise must be a non-negative integer paise");
  const margin = resolveMarginPct(item, config);
  return Math.round(item.landedUnitCostPaise * (1 + margin));
}

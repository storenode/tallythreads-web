import { supabase } from "@/lib/supabaseClient";
import type { DemoOrgType } from "./demoPlacement";

/**
 * Demo seeding for store inventory categories (Inventory phase 1, roadmap/inventory.md).
 * Direct server inserts (platform-admin RLS), like the placement / stock-room / trip seeders,
 * so a new demo store's categories are on the server immediately and show ticked in the
 * wizard's Stores step. Seeded BEFORE the store's placement tree so sections can be tagged
 * with a category (DemoPlacementNode.category → stock_locations.category_id).
 */

/** Categories per demo org type — mostly the standard departments (STANDARD_CATEGORIES), plus
 * one custom name where the shop really has one. Every store of that type gets the same set. */
export const DEMO_CATEGORIES: Record<DemoOrgType, string[]> = {
  // Traditional folded-stock shop (Vasavi).
  independent: ["Sarees", "Dress Materials", "Readymade", "Blouse Pieces & Falls"],
  // Multi-floor chain showroom (Sri Lakshmi).
  chain: ["Men's Wear", "Women's Wear", "Kids Wear", "Sarees", "Home Furnishing"],
  // Bandrip streetwear franchise — "Streetwear" is a custom (non-standard) category.
  franchise: ["Streetwear", "Accessories"],
};

/** Inserts a store's demo categories; returns their ids by name (for placement tagging). */
export async function seedDemoStoreCategories(
  orgId: string,
  storeId: string,
  orgType: DemoOrgType,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("inventory_categories")
    .insert(
      DEMO_CATEGORIES[orgType].map((name) => ({
        organization_id: orgId,
        store_id: storeId,
        name,
        next_sequence: 1,
      })),
    )
    .select("id, name");
  if (error) throw error;
  return new Map((data ?? []).map((c) => [c.name as string, c.id as string]));
}

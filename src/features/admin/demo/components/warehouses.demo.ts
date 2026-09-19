import { supabase } from "@/lib/supabaseClient";
import { insertDemoStockLocation } from "./demoPlacement";
import type { OrgStore } from "@/features/stores/stores";
import type { WarehouseType } from "@/db";

/**
 * Demo seeding for Warehouses / stock rooms (specs/roadmap/warehouses.md §6). Uses direct
 * server inserts (platform-admin RLS) — like the purchase-trip and placement seeders — so a
 * freshly created demo's stock rooms, their store attachments, and their internal placements
 * are immediately, reliably on the server (no offline-sync wait). Spread across the three org
 * types to exercise the full mapping matrix: store-level backyard · org-level central godown ·
 * one-warehouse-many-stores · a store with two stock rooms · an unattached org-level warehouse.
 */

export type DemoOrgType = "independent" | "chain" | "franchise";

interface DemoZone {
  code: string;
  label?: string;
}

/** Create a warehouse + attach stores + a flat set of zone placements (demo scale),
 * all via direct server inserts. */
async function makeWarehouse(
  orgId: string,
  name: string,
  type: WarehouseType,
  attachStoreIds: string[],
  zones: DemoZone[],
): Promise<void> {
  const { data: wh, error } = await supabase
    .from("warehouses")
    .insert({
      organization_id: orgId,
      name,
      warehouse_type: type,
      note: null,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  const warehouseId = wh.id as string;

  for (const sid of attachStoreIds) {
    const { error: linkErr } = await supabase
      .from("warehouse_stores")
      .insert({ warehouse_id: warehouseId, store_id: sid });
    if (linkErr) throw linkErr;
  }

  let i = 0;
  for (const z of zones) {
    await insertDemoStockLocation({
      store_id: null,
      warehouse_id: warehouseId,
      parent_id: null,
      placement_type: "zone",
      code: z.code,
      label: z.label ?? null,
      direction: null,
      rack_row: null,
      rack_col: null,
      color: null,
      sort_order: i++,
    });
  }
}

export async function seedDemoWarehouses(
  orgId: string,
  orgType: DemoOrgType,
  stores: OrgStore[],
): Promise<void> {
  const ids = stores.map((s) => s.id);
  if (ids.length === 0) return;

  if (orgType === "independent") {
    // A store's own backyard (understairs), attached to the single store.
    await makeWarehouse(orgId, "Backyard", "backyard", [ids[0]], [
      { code: "Understairs", label: "Overflow stock under the stairs" },
      { code: "Corner rack" },
    ]);
    return;
  }

  if (orgType === "chain") {
    // Central godown → ALL stores (hub-and-spoke).
    await makeWarehouse(orgId, "Central Godown", "godown", ids, [
      { code: "Bay A", label: "Fast movers" },
      { code: "Bay B" },
      { code: "Bay C" },
    ]);
    // One store also keeps its own backyard (richest mapping: a store with two stock rooms).
    await makeWarehouse(orgId, "Flagship Backyard", "backyard", [ids[0]], [
      { code: "Backyard" },
    ]);
    // An org-level room not yet attached to any store.
    await makeWarehouse(orgId, "Transit hold", "other", [], [
      { code: "Staging" },
    ]);
    return;
  }

  // franchise — a franchisor-side godown attached to the franchise stores.
  await makeWarehouse(orgId, "Bandrip Godown", "godown", ids, [
    { code: "Rack wall" },
    { code: "Caps & accessories" },
  ]);
}

import { createStockLocation } from "@/features/inventory/placement/data";
import {
  createWarehouse,
  attachStore,
} from "@/features/warehouses/data";
import type { OrgStore } from "@/features/stores/stores";
import type { WarehouseType } from "@/db";

/**
 * Demo seeding for Warehouses / stock rooms (specs/roadmap/warehouses.md §6). Writes through the
 * app's real offline-first path (Dexie + outbox) so demo stock rooms, their store attachments,
 * and their internal placements behave exactly like real data. Spread across the three org types
 * to exercise the full mapping matrix: store-level backyard · org-level central godown ·
 * one-warehouse-many-stores · a store with two stock rooms · an unattached org-level warehouse.
 */

export type DemoOrgType = "independent" | "chain" | "franchise";

interface DemoZone {
  code: string;
  label?: string;
}

/** Create a warehouse + attach stores + a flat set of zone/rack placements (demo scale). */
async function makeWarehouse(
  orgId: string,
  name: string,
  type: WarehouseType,
  attachStoreIds: string[],
  zones: DemoZone[],
): Promise<void> {
  const wh = await createWarehouse({
    organization_id: orgId,
    name,
    warehouse_type: type,
    note: null,
    sort_order: 0,
  });
  if (!wh.id) return;
  for (const sid of attachStoreIds) await attachStore(wh.id, sid);
  let i = 0;
  for (const z of zones) {
    await createStockLocation({
      store_id: null,
      warehouse_id: wh.id,
      parent_id: null,
      placement_type: "zone",
      code: z.code,
      label: z.label ?? null,
      direction: null,
      rack_row: null,
      rack_col: null,
      layout: null,
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

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({ supabase: {} }));
vi.mock("@/sync/syncEngine", () => ({ drainOutbox: vi.fn(), runSync: vi.fn() }));

import type { InventoryItem } from "@/db";
import {
  applyPendingMoves,
  destKey,
  dispatchableFor,
  normalizeSku,
  orgHoldings,
  parseDestKey,
  type StockLevelRow,
  type StoreStockRow,
} from "./distribution";

const item = (id: string, over: Partial<InventoryItem> = {}): InventoryItem => ({
  _localId: id, _dirty: 0, last_modified_at: "", deleted_at: null,
  id, organization_id: "org", source_invoice_item_id: null, store_id: "kdp", category_id: null,
  category_code: "STR", name: "Tee", color: "Black", size: "XL", quantity: 10, mrp_paise: 49900,
  landed_unit_cost_paise: 20000, status: "finalized", sku: `SKU-${id}`, replaced_by_item_id: null,
  finalized_at: null, labels_printed: 0, created_by: null, ...over,
});

const level = (item_id: string, loc_kind: StockLevelRow["loc_kind"], quantity: number): StockLevelRow => ({
  item_id, loc_kind, quantity, store_id: loc_kind === "org" ? null : "kdp", warehouse_id: null, location_id: null,
});

describe("orgHoldings / dispatchableFor", () => {
  const items = [item("a"), item("b", { store_id: null }), item("c", { store_id: "nlr" }), item("d", { status: "draft" })];
  const levels = [
    level("a", "org", 6), level("a", "transit", 4),
    level("b", "org", 2),
    level("c", "org", 5),
    level("d", "org", 1),
    level("zzz", "org", 9), // unknown item → ignored
  ];

  it("sums org / transit / store per item", () => {
    const h = orgHoldings(levels, items);
    expect(h.map((x) => x.item.id)).toEqual(["a", "b", "c", "d"]);
    expect(h[0]).toMatchObject({ atOrg: 6, inTransit: 4, inStores: 0 });
  });

  it("a store can receive its own stock and unallocated stock, finalized only", () => {
    const ids = dispatchableFor(orgHoldings(levels, items), "kdp").map((x) => x.item.id);
    expect(ids).toEqual(["a", "b"]);
  });
});

describe("applyPendingMoves", () => {
  const row = (w: string | null, l: string | null, qty: number): StoreStockRow => ({
    item_id: "a", sku: "SKU-a", name: "Tee", color: "Black", size: "XL", category_code: "STR",
    mrp_paise: 49900, warehouse_id: w, warehouse_name: w ? "Room" : null, location_id: l,
    location_code: l ? "L" : null, quantity: qty,
  });
  const labelFor = () => ({ warehouse_name: null, location_code: "NEW DROPS" });

  it("moves pieces from unplaced to a new display slot", () => {
    const out = applyPendingMoves(
      [row(null, null, 9)],
      [{ item_id: "a", quantity: 3, from_warehouse_id: null, from_location_id: null, to_warehouse_id: null, to_location_id: "disp" }],
      labelFor,
    );
    expect(out.find((r) => r.location_id === null)?.quantity).toBe(6);
    expect(out.find((r) => r.location_id === "disp")).toMatchObject({ quantity: 3, location_code: "NEW DROPS" });
  });

  it("drops a slot that is emptied, and adds into an existing one", () => {
    const out = applyPendingMoves(
      [row(null, null, 2), row("wh", null, 5)],
      [{ item_id: "a", quantity: 2, from_warehouse_id: null, from_location_id: null, to_warehouse_id: "wh", to_location_id: null }],
      labelFor,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ warehouse_id: "wh", quantity: 7 });
  });
});

describe("destination keys and SKU input", () => {
  it("round-trips", () => {
    expect(parseDestKey(destKey({ warehouseId: "w", locationId: null }))).toEqual({ warehouseId: "w", locationId: null });
    expect(parseDestKey(destKey({ warehouseId: null, locationId: null }))).toEqual({ warehouseId: null, locationId: null });
  });
  it("normalises scanned SKUs", () => {
    expect(normalizeSku("  bnd-kdp-str-black-xl-0001\n")).toBe("BND-KDP-STR-BLACK-XL-0001");
  });
});

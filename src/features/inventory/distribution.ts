import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import type { InventoryItem, StockMovement, SyncMeta } from "@/db";
import { supabase } from "@/lib/supabaseClient";
import { createRow } from "@/features/purchaseTrips/data/writeThrough";
import { drainOutbox, runSync } from "@/sync/syncEngine";
import { updateInventoryItem } from "./items";
import { downscaleToBase64 } from "@/features/purchaseTrips/receiptImage";
import { toShipmentPayload, type Shipment } from "./shipment";

/**
 * Inventory Phases 2C–2E (specs/roadmap/inventory.md §5, §7, §8): Finalize → SKUs, dispatch
 * org → store (with UNA reissue), store receive, stock on hand, and place/move.
 *
 * Server-authoritative steps (Finalize, dispatch, receive) are SECURITY DEFINER RPCs — they need
 * a connection, like the org's other one-shot actions. Store place/move is the offline path: a
 * `stock_movements` row written through Dexie + the outbox, overlaid on the last known stock until
 * it syncs.
 */

// ─── Finalize (2C) ────────────────────────────────────────────────────

/**
 * Finalize draft items: push any pending edits first (the RPC reads the server rows), then let
 * the server assign SKUs. The returned rows are written straight into Dexie (clean) so the
 * catalogue shows the SKUs immediately.
 */
export async function finalizeItems(items: InventoryItem[]): Promise<InventoryItem[]> {
  const drafts = items.filter((i) => i.status === "draft" && !i.deleted_at && i.id);
  if (!drafts.length) return [];
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("Creating a barcode needs a connection — SKUs are numbered by the server.");
  }
  await drainOutbox();
  const localIds = new Set(drafts.map((d) => d._localId));
  const pending = (await db.outbox.toArray()).filter(
    (e) => e.table === "inventory_items" && localIds.has(e.localId),
  );
  if (pending.length) {
    throw new Error("Some edits haven't synced yet — check the connection and try again.");
  }

  const { data, error } = await supabase.rpc("finalize_inventory_items", {
    p_item_ids: drafts.map((d) => d.id!),
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Omit<InventoryItem, keyof SyncMeta>[];
  await putServerItems(rows);
  return (await db.inventory_items.where("id").anyOf(rows.map((r) => r.id!)).toArray()) ?? [];
}

/** Write server rows into Dexie as clean rows, keeping each row's existing `_localId`. */
async function putServerItems(rows: (Omit<InventoryItem, keyof SyncMeta> & Partial<SyncMeta>)[]) {
  await db.transaction("rw", db.inventory_items, async () => {
    for (const r of rows) {
      const local = await db.inventory_items.where("id").equals(r.id!).first();
      await db.inventory_items.put({
        ...(r as InventoryItem),
        _localId: local?._localId ?? r.id!,
        _dirty: 0,
      });
    }
  });
}

/**
 * Run a server-side change on one item (reset / unlock): push its pending edits first so the
 * server sees them, then write the returned row into Dexie. Needs a connection.
 */
async function itemRpc(
  item: InventoryItem,
  rpc: "reset_item_sku" | "unlock_item_labels",
  args: Record<string, unknown>,
  offlineMessage: string,
): Promise<InventoryItem> {
  if (!item.id) throw new Error("This item hasn't synced yet — try again in a moment.");
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error(offlineMessage);
  await drainOutbox();
  const pending = (await db.outbox.toArray()).filter(
    (e) => e.table === "inventory_items" && e.localId === item._localId,
  );
  if (pending.length) throw new Error("Some edits haven't synced yet — check the connection and try again.");
  const { data, error } = await supabase.rpc(rpc, { p_item_id: item.id, ...args });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Omit<InventoryItem, keyof SyncMeta>[];
  await putServerItems(rows);
  return (await db.inventory_items.where("id").equals(item.id).first()) ?? item;
}

/**
 * Cancel an item's barcode (SKU generated, no labels printed, not dispatched) so its store,
 * category, colour, size or qty can change. It goes back to draft; the next barcode gets a new
 * number.
 */
export const resetItemSku = (item: InventoryItem) =>
  itemRpc(item, "reset_item_sku", {}, "Resetting a barcode needs a connection.");

/** Unlock a printed (not dispatched) item to correct it; the reason is kept for the record. */
export const unlockItemLabels = (item: InventoryItem, reason: string) =>
  itemRpc(item, "unlock_item_labels", { p_reason: reason }, "Unlocking needs a connection.");

/** Record that labels were printed for these items (count of physical labels). */
export async function markLabelsPrinted(counts: { item: InventoryItem; labels: number }[]) {
  for (const { item, labels } of counts) {
    if (labels <= 0) continue;
    await updateInventoryItem(item._localId, { labels_printed: item.labels_printed + labels });
  }
}

// ─── Org stock & dispatch (2D) ────────────────────────────────────────

export interface StockLevelRow {
  item_id: string;
  loc_kind: "org" | "transit" | "store";
  store_id: string | null;
  warehouse_id: string | null;
  location_id: string | null;
  quantity: number;
}

async function fetchOrgStockLevels(orgId: string): Promise<StockLevelRow[]> {
  const { data, error } = await supabase
    .from("stock_levels")
    .select("item_id, loc_kind, store_id, warehouse_id, location_id, quantity")
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);
  return (data ?? []) as StockLevelRow[];
}

export function useOrgStockLevels(orgId: string | undefined) {
  return useQuery({
    queryKey: ["inventory", "stock-levels", orgId],
    queryFn: () => fetchOrgStockLevels(orgId!),
    enabled: !!orgId,
  });
}

export interface OrgHolding {
  item: InventoryItem;
  /** Pieces at the organization (not yet dispatched). */
  atOrg: number;
  /** Pieces on the way to stores. */
  inTransit: number;
  /** Pieces in stores. */
  inStores: number;
}

/** Join stock levels to the org's (Dexie) items: one row per item that has any stock. */
export function orgHoldings(levels: StockLevelRow[], items: InventoryItem[]): OrgHolding[] {
  const byId = new Map(items.filter((i) => i.id).map((i) => [i.id!, i]));
  const acc = new Map<string, OrgHolding>();
  for (const l of levels) {
    const item = byId.get(l.item_id);
    if (!item) continue;
    const h = acc.get(l.item_id) ?? { item, atOrg: 0, inTransit: 0, inStores: 0 };
    if (l.loc_kind === "org") h.atOrg += l.quantity;
    else if (l.loc_kind === "transit") h.inTransit += l.quantity;
    else h.inStores += l.quantity;
    acc.set(l.item_id, h);
  }
  return [...acc.values()].sort(
    (a, b) => (a.item.sku ?? "").localeCompare(b.item.sku ?? "") || a.item.name.localeCompare(b.item.name),
  );
}

/**
 * Items that can go to `storeId` right now: at-org stock allocated to that store, plus
 * unallocated (UNA) stock — which the server reissues under the store's SKU on dispatch.
 */
export function dispatchableFor(holdings: OrgHolding[], storeId: string): OrgHolding[] {
  return holdings.filter(
    (h) =>
      h.atOrg > 0 &&
      h.item.status === "finalized" &&
      (h.item.store_id === storeId || h.item.store_id === null),
  );
}

export interface DispatchResult {
  transfer_id: string;
  reissued: { from_sku: string; item_id: string; sku: string; qty: number }[];
}

export async function dispatchStock(
  storeId: string,
  lines: { item_id: string; qty: number }[],
  note: string,
  shipment?: Shipment,
): Promise<DispatchResult> {
  const { data, error } = await supabase.rpc("dispatch_stock", {
    p_store_id: storeId,
    p_lines: lines.filter((l) => l.qty > 0),
    p_note: note || null,
    p_shipment: shipment ? toShipmentPayload(shipment) : null,
  });
  if (error) throw new Error(error.message);
  const result = data as DispatchResult;
  // Bring the reissued store-SKU items (and the UNA rows they replaced) into Dexie now, so
  // "Print the new labels" works without waiting for the next sync pull.
  const touched = lines.map((l) => l.item_id).concat(result.reissued.map((r) => r.item_id));
  const { data: rows } = await supabase.from("inventory_items").select("*").in("id", touched);
  if (rows?.length) await putServerItems(rows as InventoryItem[]);
  void runSync();
  return result;
}

/** Replace a dispatch's shipment details (allowed until the store receives it). */
export async function updateShipment(transferId: string, shipment: Shipment): Promise<void> {
  const { error } = await supabase.rpc("update_transfer_shipment", {
    p_transfer_id: transferId,
    p_shipment: toShipmentPayload(shipment),
  });
  if (error) throw new Error(error.message);
}

const RECEIPTS_BUCKET = "dispatch-receipts";

/**
 * Upload a photo of the LR / courier receipt (downscaled JPEG) to the private
 * `dispatch-receipts` bucket. Path `{orgId}/{transferId}/{uuid}.jpg` matches the bucket's RLS
 * (the transfer must still be in transit). Returns the object path for `updateShipment`.
 */
export async function uploadDispatchReceipt(orgId: string, transferId: string, file: File): Promise<string> {
  const { base64, mediaType } = await downscaleToBase64(file, 1600, 0.8);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const path = `${orgId}/${transferId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, new Blob([bytes], { type: mediaType }), { contentType: mediaType });
  if (error) throw new Error(`Receipt photo didn't upload: ${error.message}`);
  return path;
}

/** Short-lived link to view a receipt photo (org, or the receiving store). */
export async function dispatchReceiptUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 60 * 10);
  return data?.signedUrl ?? null;
}

export interface TransferSummary extends Shipment {
  id: string;
  to_store_id: string;
  status: "dispatched" | "received";
  note: string | null;
  dispatched_at: string;
  received_at: string | null;
  stock_transfer_items: { item_id: string; qty_sent: number; qty_received: number | null }[];
}

const SHIPMENT_COLUMNS =
  "transport_mode, carrier_name, tracking_no, vehicle_no, contact_name, contact_phone, packages, expected_at, freight_paise, freight_paid_by, receipt_path";

async function fetchOrgTransfers(orgId: string): Promise<TransferSummary[]> {
  const { data, error } = await supabase
    .from("stock_transfers")
    .select(
      `id, to_store_id, status, note, dispatched_at, received_at, ${SHIPMENT_COLUMNS}, stock_transfer_items(item_id, qty_sent, qty_received)`,
    )
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("dispatched_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as TransferSummary[];
}

export function useOrgTransfers(orgId: string | undefined) {
  return useQuery({
    queryKey: ["inventory", "transfers", orgId],
    queryFn: () => fetchOrgTransfers(orgId!),
    enabled: !!orgId,
  });
}

export function useInvalidateInventory() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["inventory"] });
}

// ─── Store side (2D receive, 2E stock on hand) ────────────────────────

export interface IncomingItem {
  item_id: string;
  sku: string;
  name: string;
  color: string;
  size: string;
  mrp_paise: number;
  qty_sent: number;
  qty_received: number | null;
}

export interface IncomingTransfer {
  id: string;
  status: "dispatched" | "received";
  note: string | null;
  /** Shipment details; freight is present only when the store pays it (to-pay). */
  shipment?: Partial<Shipment> | null;
  dispatched_at: string;
  received_at: string | null;
  items: IncomingItem[];
}

export function useStoreIncoming(storeId: string | undefined) {
  return useQuery({
    queryKey: ["inventory", "incoming", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("store_incoming", { p_store_id: storeId });
      if (error) throw new Error(error.message);
      return ((data ?? []) as IncomingTransfer[]).sort((a, b) =>
        b.dispatched_at.localeCompare(a.dispatched_at),
      );
    },
    enabled: !!storeId,
  });
}

export async function receiveTransfer(
  transferId: string,
  lines: { item_id: string; qty_received: number }[],
  dest: StoreDestination,
): Promise<void> {
  const { error } = await supabase.rpc("receive_transfer", {
    p_transfer_id: transferId,
    p_lines: lines,
    p_to_warehouse_id: dest.warehouseId,
    p_to_location_id: dest.locationId,
  });
  if (error) throw new Error(error.message);
}

export interface StoreStockRow {
  item_id: string;
  sku: string;
  name: string;
  color: string;
  size: string;
  category_code: string;
  mrp_paise: number;
  warehouse_id: string | null;
  warehouse_name: string | null;
  location_id: string | null;
  location_code: string | null;
  quantity: number;
}

const STOCK_CACHE_KEY = (storeId: string) => `tt:store-stock:${storeId}`;

/**
 * The store's stock on hand (server-derived, price-free). The last good answer is cached per
 * store so the page still works offline; pending local moves are overlaid by the caller.
 */
export function useStoreStock(storeId: string | undefined) {
  return useQuery({
    queryKey: ["inventory", "store-stock", storeId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("store_stock", { p_store_id: storeId });
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as StoreStockRow[];
        try {
          localStorage.setItem(STOCK_CACHE_KEY(storeId!), JSON.stringify(rows));
        } catch {
          /* storage unavailable */
        }
        return rows;
      } catch (err) {
        try {
          const cached = localStorage.getItem(STOCK_CACHE_KEY(storeId!));
          if (cached) return JSON.parse(cached) as StoreStockRow[];
        } catch {
          /* fall through */
        }
        throw err;
      }
    },
    enabled: !!storeId,
  });
}

/** Where stock sits inside a store. All null = received but not yet placed. */
export interface StoreDestination {
  warehouseId: string | null;
  locationId: string | null;
}

export const UNPLACED: StoreDestination = { warehouseId: null, locationId: null };

export const destKey = (d: StoreDestination) => `${d.warehouseId ?? ""}|${d.locationId ?? ""}`;

export function parseDestKey(key: string): StoreDestination {
  const [w, l] = key.split("|");
  return { warehouseId: w || null, locationId: l || null };
}

export interface DestinationOption {
  key: string;
  label: string;
  group: "Unplaced" | "Stock room" | "Display";
  dest: StoreDestination;
  warehouseName: string | null;
  locationCode: string | null;
}

/**
 * Every place stock can sit in this store (live, offline): "Unplaced", each attached stock room
 * (and its locations), and each display location on the store floor.
 */
export function useStoreDestinations(storeId: string | undefined) {
  return useLiveQuery(async () => {
    if (!storeId) return [] as DestinationOption[];
    const out: DestinationOption[] = [
      {
        key: destKey(UNPLACED),
        label: "Unplaced (just received)",
        group: "Unplaced",
        dest: UNPLACED,
        warehouseName: null,
        locationCode: null,
      },
    ];
    const links = (await db.warehouse_stores.where("store_id").equals(storeId).toArray()).filter(
      (l) => !l.deleted_at,
    );
    const rooms = links.length
      ? (await db.warehouses.where("id").anyOf(links.map((l) => l.warehouse_id)).toArray()).filter(
          (w) => !w.deleted_at && w.id,
        )
      : [];
    for (const room of rooms.sort((a, b) => a.name.localeCompare(b.name))) {
      const room_ = { warehouseId: room.id!, locationId: null };
      out.push({
        key: destKey(room_),
        label: room.name,
        group: "Stock room",
        dest: room_,
        warehouseName: room.name,
        locationCode: null,
      });
      const locs = (await db.stock_locations.where("warehouse_id").equals(room.id!).toArray())
        .filter((l) => !l.deleted_at && l.id)
        .sort((a, b) => a.code.localeCompare(b.code));
      for (const l of locs) {
        const d = { warehouseId: room.id!, locationId: l.id! };
        out.push({
          key: destKey(d),
          label: `${room.name} · ${l.code}`,
          group: "Stock room",
          dest: d,
          warehouseName: room.name,
          locationCode: l.code,
        });
      }
    }
    const display = (await db.stock_locations.where("store_id").equals(storeId).toArray())
      .filter((l) => !l.deleted_at && l.id)
      .sort((a, b) => a.code.localeCompare(b.code));
    for (const l of display) {
      const d = { warehouseId: null, locationId: l.id! };
      out.push({ key: destKey(d), label: l.code, group: "Display", dest: d, warehouseName: null, locationCode: l.code });
    }
    return out;
  }, [storeId]);
}

/**
 * This device's place/move rows for a store that the last stock fetch doesn't include yet:
 * still unsynced, or synced after `fetchedAt` (ms). Overlaid on the server stock.
 */
export function usePendingMoves(storeId: string | undefined, fetchedAt: number) {
  return useLiveQuery(async () => {
    if (!storeId) return [] as StockMovement[];
    return (await db.stock_movements.where("to_store_id").equals(storeId).toArray()).filter(
      (m) => !m.deleted_at && (m._dirty === 1 || Date.parse(m.last_modified_at) > fetchedAt),
    );
  }, [storeId, fetchedAt]);
}

/**
 * Apply unsynced moves to the last known stock: subtract from the source slot, add to the
 * destination slot (creating it if new). Pure — tested.
 */
export function applyPendingMoves(
  rows: StoreStockRow[],
  moves: Pick<
    StockMovement,
    "item_id" | "quantity" | "from_warehouse_id" | "from_location_id" | "to_warehouse_id" | "to_location_id"
  >[],
  labelFor: (d: StoreDestination) => { warehouse_name: string | null; location_code: string | null },
): StoreStockRow[] {
  const key = (itemId: string, w: string | null, l: string | null) => `${itemId}|${w ?? ""}|${l ?? ""}`;
  const map = new Map(rows.map((r) => [key(r.item_id, r.warehouse_id, r.location_id), { ...r }]));
  const template = new Map(rows.map((r) => [r.item_id, r]));
  for (const m of moves) {
    const base = template.get(m.item_id);
    if (!base) continue;
    const from = map.get(key(m.item_id, m.from_warehouse_id, m.from_location_id));
    if (from) from.quantity -= m.quantity;
    const toKey = key(m.item_id, m.to_warehouse_id, m.to_location_id);
    const to = map.get(toKey);
    if (to) to.quantity += m.quantity;
    else {
      const labels = labelFor({ warehouseId: m.to_warehouse_id, locationId: m.to_location_id });
      map.set(toKey, {
        ...base,
        warehouse_id: m.to_warehouse_id,
        location_id: m.to_location_id,
        ...labels,
        quantity: m.quantity,
      });
    }
  }
  return [...map.values()].filter((r) => r.quantity > 0);
}

/**
 * Move pieces between two places in the same store (stock room ↔ display, or placing
 * unplaced stock). Offline-safe: written to Dexie + outbox, pushed on the next sync.
 */
export async function recordMove(args: {
  organizationId: string;
  storeId: string;
  itemId: string;
  quantity: number;
  from: StoreDestination;
  to: StoreDestination;
  memberId: string | null;
}) {
  const { organizationId, storeId, itemId, quantity, from, to, memberId } = args;
  if (quantity <= 0) throw new Error("Enter how many pieces to move");
  if (destKey(from) === destKey(to)) throw new Error("Pick a different place to move to");
  const placing = from.warehouseId === null && from.locationId === null;
  await createRow<StockMovement>("stock_movements", db.stock_movements, {
    organization_id: organizationId,
    item_id: itemId,
    quantity,
    kind: placing ? "place" : "move",
    from_kind: "store",
    from_store_id: storeId,
    from_warehouse_id: from.warehouseId,
    from_location_id: from.locationId,
    to_kind: "store",
    to_store_id: storeId,
    to_warehouse_id: to.warehouseId,
    to_location_id: to.locationId,
    transfer_id: null,
    reason: null,
    member_id: memberId,
    created_at: new Date().toISOString(),
  });
  void runSync();
}

/** Normalise a scanned / typed SKU (scanners may add whitespace; staff type lowercase). */
export const normalizeSku = (s: string) => s.trim().toUpperCase().replace(/\s+/g, "");

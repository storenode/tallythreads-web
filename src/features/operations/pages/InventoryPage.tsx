import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowRightLeft,
  Boxes,
  MapPin,
  PackageOpen,
  Printer,
  Truck,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { db } from "@/db";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeading } from "@/components/ui/PageHeading";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { Tabs } from "@/components/ui/tabs/Tabs";
import { IncomingStockPanel } from "@/features/operations/IncomingStockPanel";
import { formatInr } from "@/lib/money";
import { getSyncStatus, subscribeSyncStatus } from "@/sync/syncEngine";
import { useMyStores } from "@/features/operations/myStores";
import {
  applyPendingMoves,
  destKey,
  normalizeSku,
  parseDestKey,
  recordMove,
  useStoreDestinations,
  usePendingMoves,
  useStoreIncoming,
  useStoreStock,
  type DestinationOption,
  type StoreDestination,
  type StoreStockRow,
} from "@/features/inventory/distribution";
import { ScanInput } from "@/features/inventory/ScanInput";
import { LocationLabelsButton } from "@/features/inventory/LabelPrint";
import { locationFromScan, suggestPlaces, type PlaceCandidate } from "@/features/inventory/putAway";
import { shipmentSummary } from "@/features/inventory/shipment";
import { useMember } from "@/features/auth/useMember";
import { hasPermission, useEntitlements } from "@/features/auth/entitlements";
import { useCategoriesByStore } from "@/features/inventory/categories";
import { useStoreWarehouseLinks } from "@/features/warehouses/data";

/**
 * Store Inventory (`/ops/:storeId/inventory`, specs/roadmap/inventory.md §2, §8), three tabs. The
 * store never creates items or sees cost — stock arrives already labelled from the organization,
 * and the store receives, places and moves it.
 * - **Stock in hand** (`inventory.read`): stock on hand by location with offline Move, and the
 *   store's categories.
 * - **Incoming Stock** (`?tab=incoming`, everyone): dispatches from the organization (→ Receive,
 *   `inventory.read` only), then the price-free purchase-trip feed.
 * - **Stock rooms** (`?tab=rooms`, `inventory.read`): where stock lives — display locations and
 *   the stock rooms attached to the store.
 */
export default function InventoryPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const { member } = useMember();
  const { data: entitlements, isLoading } = useEntitlements(member?.id);
  const canRead = hasPermission(entitlements, "inventory.read", { storeId });
  const canWrite = hasPermission(entitlements, "inventory.write", { storeId });
  const [params, setParams] = useSearchParams();

  if (isLoading || !entitlements) return null;
  const asked = params.get("tab");
  // Staff without inventory.read only get the price-free Incoming Stock tab.
  const tab = !canRead ? "incoming" : asked === "incoming" || asked === "rooms" ? asked : "stock";

  return (
    <div className="space-y-6">
      <PageHeading>Inventory</PageHeading>
      <Tabs
        activeId={tab}
        onChange={(id) => setParams(id === "stock" ? {} : { tab: id }, { replace: true })}
        items={[
          { id: "stock", label: "Stock in hand", disabled: !canRead },
          { id: "incoming", label: "Incoming Stock" },
          { id: "rooms", label: "Stock rooms", disabled: !canRead },
        ]}
      />
      {tab === "incoming" ? (
        <>
          {/* Dispatches from the organization first — the part the store acts on (Receive). */}
          {canRead && <IncomingCard storeId={storeId!} />}
          <IncomingStockPanel storeId={storeId!} />
        </>
      ) : tab === "rooms" ? (
        <WhereStockLivesCard storeId={storeId!} />
      ) : (
        <>
          <StockOnHandCard storeId={storeId!} canWrite={canWrite} />
          <CategoriesCard storeId={storeId!} />
        </>
      )}
    </div>
  );
}

/** Display locations (with their category tag) — put-away suggestions come from these. */
function useDisplayPlaces(storeId: string) {
  return useLiveQuery(
    async () =>
      (await db.stock_locations.where("store_id").equals(storeId).toArray())
        .filter((l) => !l.deleted_at && l.id)
        .map<PlaceCandidate>((l) => ({ id: l.id!, code: l.code, categoryId: l.category_id })),
    [storeId],
  );
}

const onDisplay = (r: StoreStockRow) => !r.warehouse_id && !!r.location_id;

function StockOnHandCard({ storeId, canWrite }: { storeId: string; canWrite: boolean }) {
  const stock = useStoreStock(storeId);
  const destinations = useStoreDestinations(storeId);
  const pending = usePendingMoves(storeId, stock.dataUpdatedAt);
  const sync = useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
  const [query, setQuery] = useState("");
  const [moving, setMoving] = useState<StoreStockRow | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const categories = useCategoriesByStore(storeId);
  const places = useDisplayPlaces(storeId);
  const { refetch } = stock;

  /** Where an item belongs on display (the place tagged with its category), as a Move choice. */
  const suggestionFor = (r: StoreStockRow) => {
    const [first] = suggestPlaces(r.category_code, categories ?? [], places ?? []);
    return first ? (destinations ?? []).find((d) => d.dest.locationId === first.id) : undefined;
  };

  // A finished sync may have pushed this device's moves: refresh the server view.
  useEffect(() => {
    if (sync.lastSyncAt) void refetch();
  }, [sync.lastSyncAt, refetch]);

  const labelFor = useMemo(() => {
    const byKey = new Map((destinations ?? []).map((d) => [d.key, d]));
    return (d: StoreDestination) => {
      const opt = byKey.get(destKey(d));
      return { warehouse_name: opt?.warehouseName ?? null, location_code: opt?.locationCode ?? null };
    };
  }, [destinations]);

  const rows = useMemo(
    () => applyPendingMoves(stock.data ?? [], pending ?? [], labelFor),
    [stock.data, pending, labelFor],
  );

  // One entry per item, with its slots.
  const groups = useMemo(() => {
    const q = normalizeSku(query);
    const m = new Map<string, { head: StoreStockRow; slots: StoreStockRow[]; total: number }>();
    for (const r of rows) {
      if (q && !r.sku.includes(q) && !normalizeSku(r.name).includes(q)) continue;
      const g = m.get(r.item_id) ?? { head: r, slots: [], total: 0 };
      g.slots.push(r);
      g.total += r.quantity;
      m.set(r.item_id, g);
    }
    return [...m.values()];
  }, [rows, query]);

  const total = rows.reduce((n, r) => n + r.quantity, 0);
  const unplaced = rows.filter((r) => !r.warehouse_id && !r.location_id).reduce((n, r) => n + r.quantity, 0);
  const toPutAway = rows.filter((r) => !onDisplay(r)).reduce((n, r) => n + r.quantity, 0);

  // Put-away: scanning a packet finds the item and, if some of it isn't on display yet, opens
  // Move from there with the suggested place selected.
  const onScan = (sku: string) => {
    setScanNote(null);
    if (locationFromScan(sku)) {
      setScanNote("That's a place label. Scan an item's label first, then the place in the Move window.");
      return;
    }
    setQuery(sku);
    const from = rows.find((r) => r.sku === sku && !onDisplay(r));
    if (canWrite && from) setMoving(from);
  };

  return (
    <Card
      title="Stock on hand"
      desc={
        stock.data
          ? `${total} pcs${unplaced ? ` · ${unplaced} not yet placed` : ""}. Scan a label to find it.`
          : "What this store holds, by location."
      }
    >
      {stock.isLoading ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : stock.error && !stock.data ? (
        <p className="text-sm text-fg-muted">Stock needs a connection the first time it loads.</p>
      ) : rows.length === 0 ? (
        <div className="flex items-start gap-3 text-sm text-fg-muted">
          <Boxes className="mt-0.5 size-5 shrink-0" />
          <p>
            No stock yet. Items arrive already labelled from your organization; receive a dispatch
            on the <span className="font-medium text-fg">Incoming Stock</span> tab and it shows up here
            by location.
          </p>
        </div>
      ) : (
        <>
          {canWrite && toPutAway > 0 && (
            <p className="mb-3 rounded-lg bg-brand-subtle-bg px-3 py-2 text-sm text-fg">
              <span className="font-medium">{toPutAway} pcs</span> in the stock room or not placed yet. Scan a
              packet to put it away — the app suggests where it goes.
            </p>
          )}
          <ScanInput label="Scan a label, or type a SKU or name" onScan={onScan} />
          {scanNote && <p className="mt-1 text-xs text-warning-text">{scanNote}</p>}
          {query && (
            <button type="button" className="mt-1 text-xs text-fg-muted underline" onClick={() => setQuery("")}>
              Clear “{query}”
            </button>
          )}
          <ul className="mt-3 divide-y divide-border">
            {groups.map(({ head, slots, total: n }) => (
              <li key={head.item_id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="min-w-0 truncate font-mono text-sm text-fg">{head.sku}</p>
                  <p className="text-sm font-semibold text-fg">{n} pcs</p>
                </div>
                <p className="truncate text-xs text-fg-muted">
                  {head.name} · {head.color} · {head.size} · MRP {formatInr(head.mrp_paise)}
                </p>
                {(() => {
                  const sug = suggestionFor(head);
                  if (!sug || !slots.some((sl) => !onDisplay(sl))) return null;
                  return (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-brand">
                      <MapPin size={12} /> Goes on: Display · {sug.label}
                    </p>
                  );
                })()}
                <ul className="mt-2 flex flex-wrap gap-2">
                  {slots.map((sl) => (
                    <li key={`${sl.warehouse_id}|${sl.location_id}`}>
                      <button
                        type="button"
                        disabled={!canWrite}
                        onClick={() => setMoving(sl)}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 text-sm text-fg enabled:hover:border-fg-muted"
                      >
                        <span className="text-fg-muted">{slotLabel(sl)}</span>
                        <span className="font-semibold">{sl.quantity}</span>
                        {canWrite && <ArrowRightLeft size={14} className="text-fg-muted" />}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {groups.length === 0 && <li className="py-3 text-sm text-fg-muted">No match for “{query}”.</li>}
          </ul>
        </>
      )}
      {moving && (
        <MoveDialog
          storeId={storeId}
          slot={moving}
          destinations={destinations ?? []}
          suggested={suggestionFor(moving)}
          onClose={() => setMoving(null)}
        />
      )}
    </Card>
  );
}

const slotLabel = (r: StoreStockRow) =>
  r.warehouse_id
    ? `${r.warehouse_name ?? "Stock room"}${r.location_code ? ` · ${r.location_code}` : ""}`
    : r.location_code
      ? `Display · ${r.location_code}`
      : "Unplaced";

function MoveDialog({
  storeId,
  slot,
  destinations,
  suggested,
  onClose,
}: {
  storeId: string;
  slot: StoreStockRow;
  destinations: DestinationOption[];
  /** Where the item belongs on display (category-tagged place), pre-selected. */
  suggested?: DestinationOption;
  onClose: () => void;
}) {
  const { member } = useMember();
  const { data: entitlements } = useEntitlements(member?.id);
  // The store's org: from cached entitlements (offline), else the store row.
  const entOrgId = entitlements?.stores.find((s) => s.storeId === storeId)?.organizationId ?? null;
  const { data: myStores } = useMyStores(entOrgId ? [] : [storeId]);
  const organizationId = entOrgId ?? myStores?.[0]?.organizationId ?? null;

  const from: StoreDestination = { warehouseId: slot.warehouse_id, locationId: slot.location_id };
  const choices = destinations.filter((d) => d.key !== destKey(from) && d.group !== "Unplaced");
  const suggestedKey = suggested && choices.some((c) => c.key === suggested.key) ? suggested.key : null;
  const [to, setTo] = useState(suggestedKey ?? choices[0]?.key ?? "");

  // Scan the place's QR label to pick it (put-away without scrolling a list).
  const onPlaceScan = (raw: string) => {
    const id = locationFromScan(raw);
    if (!id) return setError("That isn't a place label — scan the QR on the rack or shelf.");
    const hit = choices.find((c) => c.dest.locationId === id);
    if (!hit) return setError("That place isn't in this store (or it's where the stock already is).");
    setError(null);
    setTo(hit.key);
  };
  const [qty, setQty] = useState(String(slot.quantity));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const n = Math.floor(Number(qty));
    if (!organizationId) return setError("Store details haven't loaded yet — try again online.");
    if (!(n > 0 && n <= slot.quantity)) return setError(`Enter 1–${slot.quantity}`);
    try {
      await recordMove({
        organizationId,
        storeId,
        itemId: slot.item_id,
        quantity: n,
        from,
        to: parseDestKey(to),
        memberId: member?.id ?? null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal open onClose={onClose} title={`Move ${slot.sku}`}>
      <p className="mb-4 text-sm text-fg-muted">
        From <span className="font-medium text-fg">{slotLabel(slot)}</span> ({slot.quantity} pcs). Works offline —
        syncs when you&apos;re back online.
      </p>
      {choices.length === 0 ? (
        <p className="text-sm text-fg-muted">
          No other places set up. Add display locations or attach a stock room in the organization console.
        </p>
      ) : (
        <div className="space-y-3">
          {suggestedKey && (
            <p className="flex items-center gap-1 text-sm text-brand">
              <MapPin size={14} /> Suggested: Display · {suggested!.label}
            </p>
          )}
          <ScanInput label="Scan the place's QR label" onScan={onPlaceScan} />
          <SingleSelect
            label="To"
            placeholder={null}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            options={choices.map((d) => ({
              value: d.key,
              label: d.group === "Display" ? `Display · ${d.label}` : d.label,
            }))}
          />
          <Input label="Pieces" type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          {error && <p className="text-sm text-error-text">{error}</p>}
          <Button type="button" className="w-full" onClick={save}>
            Move
          </Button>
        </div>
      )}
    </Modal>
  );
}

function IncomingCard({ storeId }: { storeId: string }) {
  const incoming = useStoreIncoming(storeId);
  const list = incoming.data ?? [];
  const waiting = list.filter((t) => t.status === "dispatched");
  const recent = list.filter((t) => t.status === "received");
  return (
    <Card title="Incoming from the organization" desc="Dispatches on their way to this store.">
      {incoming.isLoading ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : list.length === 0 ? (
        <div className="flex items-start gap-3 text-sm text-fg-muted">
          <PackageOpen className="mt-0.5 size-5 shrink-0" />
          <p>
            {incoming.error
              ? "Incoming dispatches need a connection to load."
              : "Nothing dispatched right now. When the organization sends stock, receive it here by scanning each label — shortages or extras are flagged automatically."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {[...waiting, ...recent].map((t) => {
            const sent = t.items.reduce((n, i) => n + i.qty_sent, 0);
            const got = t.items.reduce((n, i) => n + (i.qty_received ?? 0), 0);
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
                <Truck size={16} className="shrink-0 text-fg-muted" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-fg">
                    {t.items.length} SKU{t.items.length === 1 ? "" : "s"} · {sent} pcs
                  </p>
                  <p className="text-xs text-fg-muted">
                    Sent {t.dispatched_at.slice(0, 10)}
                    {t.shipment?.transport_mode ? ` · ${shipmentSummary(t.shipment, "store")}` : ""}
                    {t.note ? ` · ${t.note}` : ""}
                    {t.status === "received" ? ` · received ${got}/${sent}` : ""}
                  </p>
                </div>
                {t.status === "dispatched" ? (
                  <Link
                    to={`/ops/${storeId}/inventory/receive/${t.id}`}
                    className="inline-flex min-h-11 items-center rounded-full bg-tt-green-500 px-5 text-sm font-semibold text-white hover:bg-tt-green-600"
                  >
                    Receive
                  </Link>
                ) : (
                  <span className="rounded-full bg-success-bg px-2 py-0.5 text-xs font-medium text-success-text">
                    Received
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function WhereStockLivesCard({ storeId }: { storeId: string }) {
  const links = useStoreWarehouseLinks(storeId);
  const { data: myStores } = useMyStores([storeId]);
  const orgId = myStores?.[0]?.organizationId;
  const storeName = myStores?.[0]?.name ?? "Display";
  const data = useLiveQuery(async () => {
    const display = (
      await db.stock_locations.where("store_id").equals(storeId).toArray()
    ).filter((l) => !l.deleted_at);
    const roomIds = (links ?? []).map((l) => l.warehouse_id);
    const rooms = roomIds.length
      ? (await db.warehouses.where("id").anyOf(roomIds).toArray()).filter((w) => !w.deleted_at)
      : [];
    const roomLocationCounts = new Map<string, number>();
    const roomLocations = new Map<string, { id: string; code: string }[]>();
    for (const room of rooms) {
      const locs = (await db.stock_locations.where("warehouse_id").equals(room.id!).toArray()).filter(
        (l) => !l.deleted_at && l.id,
      );
      roomLocationCounts.set(room.id!, locs.length);
      roomLocations.set(
        room.id!,
        locs.map((l) => ({ id: l.id!, code: l.code })).sort((a, b) => a.code.localeCompare(b.code)),
      );
    }
    return { display, rooms, roomLocationCounts, roomLocations };
  }, [storeId, links]);

  if (!data) return null;
  const counts = data.display.reduce<Record<string, number>>((acc, l) => {
    acc[l.placement_type] = (acc[l.placement_type] ?? 0) + 1;
    return acc;
  }, {});
  const displaySummary = Object.entries(counts)
    .map(([type, n]) => `${n} ${type}${n === 1 ? "" : "s"}`)
    .join(" · ");

  const displayLabels = data.display
    .filter((l) => l.id)
    .map((l) => ({ id: l.id!, code: l.code, place: `Display · ${storeName}` }))
    .sort((a, b) => a.code.localeCompare(b.code));
  const printBtn =
    "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-fg hover:bg-surface-2 disabled:opacity-50";

  return (
    <Card
      title="Where stock lives"
      desc="Received stock is placed in a stock room or on display. Stick a QR label on each place: when putting stock away, scan the item, then the place."
    >
      <ul className="space-y-3 text-sm">
        <li className="flex items-start gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-fg-muted" />
          <div>
            <p className="font-medium text-fg">Display</p>
            <p className="text-fg-muted">
              {data.display.length ? displaySummary : "No display locations set up yet."}
            </p>
            {orgId && displayLabels.length > 0 && (
              <div className="mt-2">
                <LocationLabelsButton orgId={orgId} labels={displayLabels} className={printBtn}>
                  <Printer size={14} /> Print place labels ({displayLabels.length})
                </LocationLabelsButton>
              </div>
            )}
          </div>
        </li>
        <li className="flex items-start gap-3">
          <WarehouseIcon className="mt-0.5 size-5 shrink-0 text-fg-muted" />
          <div className="min-w-0">
            <p className="font-medium text-fg">Stock rooms</p>
            {data.rooms.length ? (
              <ul className="text-fg-muted">
                {data.rooms.map((r) => {
                  const locs = data.roomLocations.get(r.id!) ?? [];
                  return (
                    <li key={r._localId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="truncate">
                        {r.name}
                        {(() => {
                          const n = data.roomLocationCounts.get(r.id!) ?? 0;
                          return n ? ` · ${n} location${n === 1 ? "" : "s"}` : "";
                        })()}
                      </span>
                      {orgId && locs.length > 0 && (
                        <LocationLabelsButton
                          orgId={orgId}
                          labels={locs.map((l) => ({ ...l, place: r.name }))}
                          className={printBtn}
                        >
                          <Printer size={14} /> Print place labels ({locs.length})
                        </LocationLabelsButton>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-fg-muted">No stock rooms attached to this store.</p>
            )}
          </div>
        </li>
      </ul>
    </Card>
  );
}

function CategoriesCard({ storeId }: { storeId: string }) {
  const categories = useCategoriesByStore(storeId);
  if (categories === undefined) return null;
  return (
    <Card title="Categories" desc="The departments this store sells. The code appears on barcodes.">
      {categories.length === 0 ? (
        <p className="text-sm text-fg-muted">No categories set up for this store yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <li
              key={c._localId}
              className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-sm"
            >
              <span className="text-fg">{c.name}</span>
              {c.code && (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg-muted">
                  {c.code}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Send, Truck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { useStoresByOrg } from "@/features/stores/stores";
import { formatInr } from "@/lib/money";
import {
  dispatchStock,
  dispatchableFor,
  orgHoldings,
  useInvalidateInventory,
  useOrgItems,
  useOrgStockLevels,
  useOrgTransfers,
  type DispatchResult,
} from "../distribution";
import { ScanInput } from "../ScanInput";

/**
 * Org "Stock & dispatch" tab (specs/roadmap/inventory.md §5, §8): what the organization holds
 * (finalized, not yet sent), a dispatch builder to send pieces to a store, and recent dispatches
 * with their receive status. Unallocated (UNA) pieces are reissued under the store's SKU as they
 * leave — the result links straight to printing their new labels.
 */
export function StockDispatchTab({ orgId }: { orgId: string }) {
  const items = useOrgItems(orgId);
  const levels = useOrgStockLevels(orgId);
  const transfers = useOrgTransfers(orgId);
  const { data: stores } = useStoresByOrg(orgId);
  const invalidate = useInvalidateInventory();

  const holdings = useMemo(() => orgHoldings(levels.data ?? [], items ?? []), [levels.data, items]);
  const atOrg = holdings.filter((h) => h.atOrg > 0);
  const storeName = (id: string | null) =>
    id ? (stores?.find((s) => s.id === id)?.name ?? "Store") : "Unallocated";

  if (levels.isLoading || items === undefined) return <p className="text-sm text-fg-muted">Loading…</p>;
  if (levels.error) {
    return (
      <Card>
        <p className="text-sm text-fg-muted">Stock needs a connection to load. {String(levels.error.message)}</p>
      </Card>
    );
  }

  const totals = holdings.reduce(
    (t, h) => ({
      org: t.org + h.atOrg,
      transit: t.transit + h.inTransit,
      stores: t.stores + h.inStores,
      value: t.value + h.atOrg * h.item.mrp_paise,
    }),
    { org: 0, transit: 0, stores: 0, value: 0 },
  );

  return (
    <div className="space-y-6">
      <Card title="Stock overview">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Stat label="At organization" value={`${totals.org} pcs`} />
          <Stat label="MRP value at org" value={formatInr(totals.value)} />
          <Stat label="In transit" value={`${totals.transit} pcs`} />
          <Stat label="In stores" value={`${totals.stores} pcs`} />
        </dl>
      </Card>

      <DispatchBuilder
        orgId={orgId}
        holdings={holdings}
        stores={stores ?? []}
        onDone={() => void invalidate()}
      />

      <Card title="At the organization" desc="Finalized pieces not yet dispatched.">
        {atOrg.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Nothing here. Finalize catalogued items (Ready for inventory → Catalogue) to bring them in.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {atOrg.map((h) => (
              <li key={h.item._localId} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <span className="min-w-0 basis-full font-mono text-fg sm:basis-auto sm:flex-1 sm:truncate">
                  {h.item.sku}
                </span>
                <span className="min-w-0 flex-1 truncate text-fg-muted sm:flex-none sm:basis-64">
                  {h.item.name} · {h.item.color} · {h.item.size}
                </span>
                <span className="text-fg-muted">{storeName(h.item.store_id)}</span>
                <span className="w-16 text-right font-medium text-fg">{h.atOrg} pcs</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent dispatches">
        {transfers.isLoading ? (
          <p className="text-sm text-fg-muted">Loading…</p>
        ) : (transfers.data ?? []).length === 0 ? (
          <p className="text-sm text-fg-muted">No dispatches yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {(transfers.data ?? []).map((t) => {
              const sent = t.stock_transfer_items.reduce((n, i) => n + i.qty_sent, 0);
              const got = t.stock_transfer_items.reduce((n, i) => n + (i.qty_received ?? 0), 0);
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                  <Truck size={16} className="shrink-0 text-fg-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-fg">{storeName(t.to_store_id)}</p>
                    <p className="truncate text-xs text-fg-muted">
                      {t.dispatched_at.slice(0, 10)} · {t.stock_transfer_items.length} SKU
                      {t.stock_transfer_items.length === 1 ? "" : "s"} · {sent} pcs
                      {t.note ? ` · ${t.note}` : ""}
                    </p>
                  </div>
                  {t.status === "received" ? (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        got === sent ? "bg-success-bg text-success-text" : "bg-warning-bg text-warning-text"
                      }`}
                    >
                      Received {got}/{sent}
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-muted">
                      In transit
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function DispatchBuilder({
  orgId,
  holdings,
  stores,
  onDone,
}: {
  orgId: string;
  holdings: ReturnType<typeof orgHoldings>;
  stores: { id: string; name: string; store_code: string | null }[];
  onDone: () => void;
}) {
  const [storeId, setStoreId] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<(DispatchResult & { store: string; pieces: number }) | null>(null);

  const options = storeId ? dispatchableFor(holdings, storeId) : [];
  const lines = options
    .map((h) => ({ item_id: h.item.id!, qty: Math.min(qty[h.item.id!] ?? 0, h.atOrg) }))
    .filter((l) => l.qty > 0);
  const pieces = lines.reduce((n, l) => n + l.qty, 0);

  const addScan = (sku: string) => {
    const h = options.find((o) => o.item.sku === sku);
    if (!h) {
      setError(`${sku} isn't at the organization for this store`);
    } else {
      setError(null);
      setQty((q) => ({ ...q, [h.item.id!]: Math.min((q[h.item.id!] ?? 0) + 1, h.atOrg) }));
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await dispatchStock(storeId, lines, note);
      setResult({ ...res, store: stores.find((s) => s.id === storeId)?.name ?? "the store", pieces });
      setQty({});
      setNote("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Dispatch to a store"
      desc="Pick the store, then the pieces. Unallocated stock gets the store's SKU as it leaves — print its new labels before packing."
    >
      {result && (
        <div className="mb-4 rounded-lg border border-success-text/30 bg-success-bg p-3 text-sm text-success-text">
          <p className="font-medium">
            Dispatched {result.pieces} pcs to {result.store}. They show as incoming at the store until received.
          </p>
          {result.reissued.length > 0 && (
            <div className="mt-2">
              <p>
                {result.reissued.length} unallocated item{result.reissued.length === 1 ? " was" : "s were"} reissued
                with store SKUs:
              </p>
              <ul className="mt-1 font-mono text-xs">
                {result.reissued.map((r) => (
                  <li key={r.item_id}>
                    {r.from_sku} → {r.sku} × {r.qty}
                  </li>
                ))}
              </ul>
              <Link
                to={`/org/${orgId}/inventory/labels?items=${result.reissued.map((r) => `${r.item_id}:${r.qty}`).join(",")}`}
                className="mt-2 inline-block font-semibold underline"
              >
                Print the new labels →
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <SingleSelect
          label="Store"
          placeholder="Choose a store"
          value={storeId}
          onChange={(e) => {
            setStoreId(e.target.value);
            setQty({});
            setResult(null);
          }}
          options={stores.map((s) => ({ value: s.id, label: s.store_code ? `${s.name} (${s.store_code})` : s.name }))}
        />
        {storeId && <ScanInput label="Scan or type a SKU (+1)" onScan={addScan} />}
      </div>

      {storeId && (
        <>
          {options.length === 0 ? (
            <p className="mt-4 text-sm text-fg-muted">Nothing at the organization for this store.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {options.map((h) => {
                const id = h.item.id!;
                const n = qty[id] ?? 0;
                return (
                  <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="truncate font-mono text-sm text-fg">{h.item.sku}</p>
                      <p className="truncate text-xs text-fg-muted">
                        {h.item.name} · {h.item.color} · {h.item.size} · {h.atOrg} at org
                        {h.item.store_id === null && " · unallocated (reissued on dispatch)"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-24">
                        <Input
                          label="Send"
                          type="number"
                          inputMode="numeric"
                          value={n ? String(n) : ""}
                          placeholder="0"
                          onChange={(e) =>
                            setQty((q) => ({
                              ...q,
                              [id]: Math.min(Math.max(0, Math.floor(Number(e.target.value)) || 0), h.atOrg),
                            }))
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mt-6"
                        onClick={() => setQty((q) => ({ ...q, [id]: h.atOrg }))}
                      >
                        All
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Box 3 of 5, via KPN parcel" />
            <Button type="button" onClick={submit} disabled={busy || pieces === 0}>
              <Send size={16} /> {busy ? "Dispatching…" : `Dispatch ${pieces} pcs`}
            </Button>
          </div>
        </>
      )}
      {error && (
        <p className="mt-3 text-sm text-error-text">{error}</p>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1 font-medium text-fg">{value}</dd>
    </div>
  );
}

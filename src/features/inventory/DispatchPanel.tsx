import { type ReactNode, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Camera, CheckCircle2, Pencil, Printer, Send, Truck, X } from "lucide-react";
import { db, type InventoryItem } from "@/db";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { cn } from "@/lib/cn";
import { rupeesToPaise } from "@/lib/money";
import {
  dispatchReceiptUrl,
  dispatchStock,
  updateShipment,
  uploadDispatchReceipt,
  useInvalidateInventory,
  type DispatchResult,
  type OrgHolding,
  type TransferSummary,
} from "./distribution";
import { PrintLabelsButton } from "./LabelPrint";
import {
  TRANSPORT_MODES,
  modeInfo,
  shipmentSummary,
  validateShipment,
  type FreightPayer,
  type Shipment,
  type TransportMode,
} from "./shipment";

/**
 * Phase 2G (specs/roadmap/inventory.md §11): dispatch from the Catalogue with shipment details.
 * These views REPLACE a line's items table (or the Dispatches list) with a "← Back" button —
 * no modal. Dispatch is a server RPC, so it needs a connection (like Finalize).
 */

export type StoreOption = { id: string; name: string; store_code: string | null };

const storeLabel = (s: StoreOption | undefined) =>
  s ? (s.store_code ? `${s.name} (${s.store_code})` : s.name) : "Store";

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

// ── shipment form state ────────────────────────────────────────────────────────────────────

interface ShipmentDraft {
  mode: TransportMode | null;
  carrier: string;
  tracking: string;
  vehicle: string;
  contactName: string;
  contactPhone: string;
  packages: string;
  expected: string;
  freight: string;
  paidBy: FreightPayer;
  note: string;
  photo: File | null;
}

const emptyDraft = (): ShipmentDraft => ({
  mode: null,
  carrier: "",
  tracking: "",
  vehicle: "",
  contactName: "",
  contactPhone: "",
  packages: "",
  expected: "",
  freight: "",
  paidBy: "org",
  note: "",
  photo: null,
});

const draftFromTransfer = (t: TransferSummary): ShipmentDraft => ({
  mode: t.transport_mode,
  carrier: t.carrier_name ?? "",
  tracking: t.tracking_no ?? "",
  vehicle: t.vehicle_no ?? "",
  contactName: t.contact_name ?? "",
  contactPhone: t.contact_phone ?? "",
  packages: t.packages != null ? String(t.packages) : "",
  expected: t.expected_at ?? "",
  freight: t.freight_paise != null ? String(t.freight_paise / 100) : "",
  paidBy: t.freight_paid_by ?? "org",
  note: t.note ?? "",
  photo: null,
});

function draftToShipment(d: ShipmentDraft, receiptPath: string | null): Shipment {
  const freight = d.freight.trim() ? rupeesToPaise(d.freight) : null;
  const packages = d.packages.trim() ? Number(d.packages) : null;
  return {
    transport_mode: d.mode,
    carrier_name: d.carrier,
    tracking_no: d.tracking,
    vehicle_no: d.vehicle,
    contact_name: d.contactName,
    contact_phone: d.contactPhone,
    packages,
    expected_at: d.expected || null,
    // Unparseable freight becomes -1 so validateShipment flags it instead of silently dropping it.
    freight_paise: freight ?? (d.freight.trim() ? -1 : null),
    freight_paid_by: d.paidBy,
    receipt_path: receiptPath,
  };
}

/** Mode, carrier/tracking/vehicle for that mode, contact, boxes, ETA, freight + payer, photo, note. */
function ShipmentFields({
  draft,
  onChange,
  existingReceipt,
}: {
  draft: ShipmentDraft;
  onChange: (d: ShipmentDraft) => void;
  existingReceipt?: string | null;
}) {
  const set = <K extends keyof ShipmentDraft>(k: K, v: ShipmentDraft[K]) => onChange({ ...draft, [k]: v });
  const info = modeInfo(draft.mode);

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-fg-muted">How is it going?</legend>
        <div className="flex flex-wrap gap-2">
          {TRANSPORT_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={draft.mode === m.value}
              onClick={() => set("mode", m.value)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-medium",
                draft.mode === m.value
                  ? "border-brand bg-brand-subtle-bg text-brand"
                  : "border-border text-fg hover:bg-surface-2",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </fieldset>

      {info && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {info.carrierLabel && (
            <Input
              label={info.carrierLabel}
              placeholder={info.carrierPlaceholder}
              value={draft.carrier}
              onChange={(e) => set("carrier", e.target.value)}
            />
          )}
          {info.trackingLabel && (
            <Input
              label={`${info.trackingLabel}${info.trackingRequired ? "" : " (optional)"}`}
              value={draft.tracking}
              onChange={(e) => set("tracking", e.target.value)}
            />
          )}
          {info.showVehicle && (
            <Input
              label="Vehicle / bus no. (optional)"
              placeholder="AP 39 AB 1234"
              value={draft.vehicle}
              onChange={(e) => set("vehicle", e.target.value)}
            />
          )}
          <Input
            label={draft.mode === "hand" ? "Delivered by" : "Contact name (optional)"}
            value={draft.contactName}
            onChange={(e) => set("contactName", e.target.value)}
          />
          <Input
            label="Contact phone (optional)"
            type="tel"
            inputMode="tel"
            value={draft.contactPhone}
            onChange={(e) => set("contactPhone", e.target.value)}
          />
          <Input
            label="Boxes / bundles"
            type="number"
            inputMode="numeric"
            value={draft.packages}
            onChange={(e) => set("packages", e.target.value)}
          />
          <Input
            label="Expected arrival"
            type="date"
            value={draft.expected}
            onChange={(e) => set("expected", e.target.value)}
          />
          <Input
            label="Freight (₹, optional)"
            type="number"
            inputMode="decimal"
            value={draft.freight}
            onChange={(e) => set("freight", e.target.value)}
          />
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-fg-muted">Freight paid by</legend>
            <div className="flex flex-wrap gap-x-4">
              {(
                [
                  ["org", "Organization"],
                  ["store", "Store (to-pay)"],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className="inline-flex min-h-11 items-center gap-2 text-sm text-fg">
                  <input
                    type="radio"
                    className="size-4 accent-brand"
                    checked={draft.paidBy === v}
                    onChange={() => set("paidBy", v)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      {info && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-fg hover:bg-surface-2">
            <Camera size={16} />
            {draft.photo ? "Change photo" : existingReceipt ? "Replace LR / receipt photo" : "Add LR / receipt photo"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => set("photo", e.target.files?.[0] ?? null)}
            />
          </label>
          {draft.photo && (
            <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
              {draft.photo.name}
              <button
                type="button"
                aria-label="Remove photo"
                className="inline-flex min-h-11 min-w-11 items-center justify-center hover:text-fg"
                onClick={() => set("photo", null)}
              >
                <X size={14} />
              </button>
            </span>
          )}
          {!draft.photo && existingReceipt && <ReceiptLink path={existingReceipt} />}
        </div>
      )}

      {info && (
        <Input
          label="Note (optional)"
          placeholder="e.g. Box 3 of 5"
          value={draft.note}
          onChange={(e) => set("note", e.target.value)}
        />
      )}
    </div>
  );
}

/** Opens the receipt photo (short-lived signed link) in a new tab. */
export function ReceiptLink({ path, className }: { path: string; className?: string }) {
  return (
    <button
      type="button"
      className={cn("inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand hover:underline", className)}
      onClick={async () => {
        const w = window.open("", "_blank");
        const url = await dispatchReceiptUrl(path);
        if (w && url) w.location.href = url;
        else w?.close();
      }}
    >
      <Camera size={14} /> Receipt photo
    </button>
  );
}

/** Upload the photo (if any) once the transfer exists, then save it on the shipment. */
async function attachPhoto(orgId: string, transferId: string, draft: ShipmentDraft) {
  if (!draft.photo) return;
  const path = await uploadDispatchReceipt(orgId, transferId, draft.photo);
  await updateShipment(transferId, draftToShipment(draft, path));
}

// ── new dispatch ───────────────────────────────────────────────────────────────────────────

interface SentGroup {
  storeId: string;
  pieces: number;
  summary: string;
  result: DispatchResult;
  photoWarning: string | null;
}

/**
 * Dispatch the chosen items: pieces per SKU, a store for unallocated rows, then one shipment
 * per store (one dispatch each). Replaces the line's table; "← Back" returns to it.
 */
export function DispatchForm({
  orgId,
  items,
  holdings,
  stores,
  onBack,
}: {
  orgId: string;
  items: InventoryItem[];
  holdings: Map<string, OrgHolding>;
  stores: StoreOption[];
  onBack: () => void;
}) {
  const invalidate = useInvalidateInventory();
  const atOrg = (it: InventoryItem) => (it.id ? (holdings.get(it.id)?.atOrg ?? 0) : 0);
  const sendable = items.filter((it) => it.status === "finalized" && atOrg(it) > 0);

  // Only what the user typed; the default is everything at the org. (Not seeded at mount: right
  // after "Dispatch" creates a SKU, the item / stock numbers can arrive a render later.)
  const [qty, setQty] = useState<Record<string, string>>({});
  const qtyText = (it: InventoryItem) => qty[it._localId] ?? String(atOrg(it));
  const [unaStore, setUnaStore] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, ShipmentDraft>>({});
  const [sent, setSent] = useState<SentGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sentStores = new Set(sent.map((g) => g.storeId));
  const storeOf = (it: InventoryItem) => it.store_id ?? unaStore[it._localId] ?? "";
  const qtyOf = (it: InventoryItem) => {
    const n = Number(qtyText(it));
    return Number.isInteger(n) ? n : NaN;
  };

  // One group (= one dispatch) per destination store, in the order stores are listed.
  const byStore = new Map<string, InventoryItem[]>();
  for (const it of sendable) {
    const sid = storeOf(it);
    if (!sid || sentStores.has(sid) || !(qtyOf(it) > 0)) continue;
    byStore.set(sid, [...(byStore.get(sid) ?? []), it]);
  }
  const groups = stores.filter((s) => byStore.has(s.id)).map((s) => ({ store: s, items: byStore.get(s.id)! }));

  const draftFor = (sid: string) => drafts[sid] ?? emptyDraft();
  const pieces = groups.reduce((n, g) => n + g.items.reduce((t, it) => t + qtyOf(it), 0), 0);

  const problems: string[] = [];
  for (const it of sendable) {
    if (sentStores.has(storeOf(it))) continue;
    const n = qtyOf(it);
    if (!Number.isInteger(n) || n < 0 || n > atOrg(it)) {
      problems.push(`${it.sku}: send between 0 and ${atOrg(it)}`);
    } else if (n > 0 && !storeOf(it)) {
      problems.push(`${it.sku}: choose the store (unallocated stock gets that store's SKU)`);
    }
  }
  for (const g of groups) {
    for (const p of validateShipment(draftToShipment(draftFor(g.store.id), null))) {
      problems.push(`${g.store.name}: ${p}`);
    }
  }

  const submit = async () => {
    if (isOffline()) {
      setError("Dispatch needs a connection — the server moves the stock and numbers any new SKUs.");
      return;
    }
    setBusy(true);
    setError(null);
    for (const g of groups) {
      const d = draftFor(g.store.id);
      try {
        const lines = g.items.map((it) => ({ item_id: it.id!, qty: qtyOf(it) }));
        const result = await dispatchStock(g.store.id, lines, d.note, draftToShipment(d, null));
        let photoWarning: string | null = null;
        try {
          await attachPhoto(orgId, result.transfer_id, d);
        } catch (e) {
          photoWarning = `${e instanceof Error ? e.message : String(e)} — add it later with Edit shipment.`;
        }
        setSent((s) => [
          ...s,
          {
            storeId: g.store.id,
            pieces: lines.reduce((n, l) => n + l.qty, 0),
            summary: shipmentSummary(draftToShipment(d, null), "org"),
            result,
            photoWarning,
          },
        ]);
      } catch (e) {
        setError(`${g.store.name}: ${e instanceof Error ? e.message : String(e)}`);
        break;
      }
    }
    setBusy(false);
    void invalidate();
  };

  const allSent = sent.length > 0 && groups.length === 0 && !error;
  const reissuedIds = sent.flatMap((g) => g.result.reissued.map((r) => r.item_id));
  const reissuedItems = useLiveQuery(
    async () => (reissuedIds.length ? db.inventory_items.where("id").anyOf(reissuedIds).toArray() : []),
    [reissuedIds.join(",")],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Back to items
        </Button>
        <span className="text-sm text-fg-muted">
          <Truck size={14} className="mr-1 inline" />
          Dispatch{groups.length > 1 ? ` · ${groups.length} stores` : ""}
        </span>
      </div>

      {sent.length > 0 && (
        <div className="rounded-lg border border-success-text/30 bg-success-bg p-3 text-sm text-success-text">
          {sent.map((g) => (
            <div key={g.storeId} className="py-1">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 size={16} /> Dispatched {g.pieces} pcs to{" "}
                {storeLabel(stores.find((s) => s.id === g.storeId))}
              </p>
              {g.summary && <p className="pl-6 text-xs">{g.summary}</p>}
              {g.photoWarning && <p className="pl-6 text-xs text-warning-text">{g.photoWarning}</p>}
            </div>
          ))}
          {reissuedItems && reissuedItems.length > 0 && (
            <div className="mt-2 border-t border-success-text/20 pt-2">
              <p>
                {reissuedItems.length} unallocated item{reissuedItems.length === 1 ? " was" : "s were"} reissued with
                store SKUs — print their new labels before packing:
              </p>
              <ul className="mt-1 font-mono text-xs">
                {sent.flatMap((g) =>
                  g.result.reissued.map((r) => (
                    <li key={r.item_id}>
                      {r.from_sku} → {r.sku} × {r.qty}
                    </li>
                  )),
                )}
              </ul>
              <div className="mt-2">
                <PrintLabelsButton
                  orgId={orgId}
                  entries={reissuedItems.map((item) => ({
                    item,
                    copies: sent
                      .flatMap((g) => g.result.reissued)
                      .find((r) => r.item_id === item.id)!.qty,
                  }))}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-success-text/40 bg-surface px-4 text-sm font-semibold text-fg hover:bg-surface-2"
                >
                  <Printer size={16} /> Print new labels
                </PrintLabelsButton>
              </div>
            </div>
          )}
        </div>
      )}

      {!allSent && (
        <>
          {sendable.length === 0 ? (
            <p className="text-sm text-fg-muted">
              Nothing to dispatch: these items have no pieces left at the organization.
            </p>
          ) : (
            <section>
              <h4 className="mb-2 text-sm font-medium text-fg">What&apos;s going</h4>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {sendable
                  .filter((it) => !sentStores.has(storeOf(it)))
                  .map((it) => (
                    <li key={it._localId} className="flex flex-wrap items-end gap-3 p-3">
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="truncate font-mono text-sm text-fg">{it.sku}</p>
                        <p className="truncate text-xs text-fg-muted">
                          {it.name} · {it.color} · {it.size} · {atOrg(it)} at org
                        </p>
                      </div>
                      {it.store_id ? (
                        <p className="min-h-11 content-center text-sm text-fg-muted sm:w-56">
                          → {storeLabel(stores.find((s) => s.id === it.store_id))}
                        </p>
                      ) : (
                        <div className="w-full sm:w-56">
                          <SingleSelect
                            label="To store"
                            placeholder="Choose a store"
                            value={unaStore[it._localId] ?? ""}
                            onChange={(e) => setUnaStore((u) => ({ ...u, [it._localId]: e.target.value }))}
                            options={stores.map((s) => ({ value: s.id, label: storeLabel(s) }))}
                          />
                        </div>
                      )}
                      <div className="w-24">
                        <Input
                          label="Send"
                          type="number"
                          inputMode="numeric"
                          value={qtyText(it)}
                          onChange={(e) => setQty((q) => ({ ...q, [it._localId]: e.target.value }))}
                        />
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          )}

          {groups.map((g) => (
            <section key={g.store.id} className="rounded-lg border border-border p-3 sm:p-4">
              <h4 className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm font-medium text-fg">
                <span>
                  <Truck size={14} className="mr-1 inline" /> {storeLabel(g.store)}
                </span>
                <span className="font-normal text-fg-muted">
                  {g.items.reduce((n, it) => n + qtyOf(it), 0)} pcs · {g.items.length} SKU
                  {g.items.length === 1 ? "" : "s"}
                </span>
              </h4>
              <ShipmentFields
                draft={draftFor(g.store.id)}
                onChange={(d) => setDrafts((all) => ({ ...all, [g.store.id]: d }))}
              />
            </section>
          ))}

          {sendable.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" onClick={submit} disabled={busy || pieces === 0 || problems.length > 0}>
                  <Send size={16} />
                  {busy
                    ? "Dispatching…"
                    : `Dispatch ${pieces} pcs${groups.length > 1 ? ` · ${groups.length} stores` : ""}`}
                </Button>
              </div>
              {problems.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-xs text-warning-text">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {error && <p className="text-sm text-error-text">{error}</p>}
      {allSent && (
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Back to items
        </Button>
      )}
    </div>
  );
}

// ── edit an in-transit dispatch ────────────────────────────────────────────────────────────

/** Edit a dispatch's shipment details / add the photo while it's in transit. */
export function EditShipmentForm({
  orgId,
  transfer,
  stores,
  onBack,
}: {
  orgId: string;
  transfer: TransferSummary;
  stores: StoreOption[];
  onBack: () => void;
}) {
  const invalidate = useInvalidateInventory();
  const [draft, setDraft] = useState(() => draftFromTransfer(transfer));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problems = validateShipment(draftToShipment(draft, transfer.receipt_path));
  const pieces = transfer.stock_transfer_items.reduce((n, i) => n + i.qty_sent, 0);

  const save = async () => {
    if (isOffline()) {
      setError("Saving needs a connection.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const path = draft.photo
        ? await uploadDispatchReceipt(orgId, transfer.id, draft.photo)
        : transfer.receipt_path;
      await updateShipment(transfer.id, draftToShipment(draft, path));
      await invalidate();
      onBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} /> Back to dispatches
        </Button>
        <span className="text-sm text-fg-muted">
          {storeLabel(stores.find((s) => s.id === transfer.to_store_id))} · {pieces} pcs · sent{" "}
          {transfer.dispatched_at.slice(0, 10)}
        </span>
      </div>
      {transfer.status !== "dispatched" ? (
        <p className="text-sm text-fg-muted">The store has received this dispatch, so its details are locked.</p>
      ) : (
        <>
          <ShipmentFields draft={draft} onChange={setDraft} existingReceipt={transfer.receipt_path} />
          <div className="flex justify-end">
            <Button type="button" onClick={save} disabled={busy || problems.length > 0}>
              {busy ? "Saving…" : "Save shipment"}
            </Button>
          </div>
          {problems.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-warning-text">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <p className="text-sm text-error-text">{error}</p>}
    </div>
  );
}

// ── per-invoice dispatch list ──────────────────────────────────────────────────────────────

/** This invoice's dispatches: store, shipment, receipt, status, and Edit while in transit. */
export function DispatchesList({
  transfers,
  stores,
  onEdit,
}: {
  transfers: TransferSummary[];
  stores: StoreOption[];
  onEdit: (transferId: string) => void;
}) {
  if (transfers.length === 0) {
    return <p className="text-sm text-fg-muted">Nothing dispatched from this invoice yet.</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {transfers.map((t) => {
        const sent = t.stock_transfer_items.reduce((n, i) => n + i.qty_sent, 0);
        const got = t.stock_transfer_items.reduce((n, i) => n + (i.qty_received ?? 0), 0);
        const summary = shipmentSummary(t, "org");
        return (
          <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
            <Truck size={16} className="shrink-0 text-fg-muted" />
            <div className="min-w-0 flex-1 basis-60">
              <p className="truncate font-medium text-fg">
                {storeLabel(stores.find((s) => s.id === t.to_store_id))}
              </p>
              <p className="text-xs text-fg-muted">
                {t.dispatched_at.slice(0, 10)} · {sent} pcs
                {summary ? ` · ${summary}` : " · no shipment details"}
                {t.note ? ` · ${t.note}` : ""}
              </p>
            </div>
            {t.receipt_path && <ReceiptLink path={t.receipt_path} />}
            {t.status === "received" ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  got === sent ? "bg-success-bg text-success-text" : "bg-warning-bg text-warning-text",
                )}
              >
                Received {got}/{sent}
              </span>
            ) : (
              <>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-muted">
                  In transit
                </span>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-brand hover:underline"
                  onClick={() => onEdit(t.id)}
                >
                  <Pencil size={14} /> Edit shipment
                </button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Card wrapper so CataloguePage can swap list ↔ edit form in place. */
export function DispatchesCard({ children }: { children: ReactNode }) {
  return (
    <Card title="Dispatches" desc="Stock sent from this invoice, how it travelled and whether the store received it.">
      {children}
    </Card>
  );
}

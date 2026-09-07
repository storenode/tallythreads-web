import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import type { PurchaseInvoice, TripRouteLeg, PendingReceipt } from "@/db";
import { RouteLegsTable } from "../components/RouteLegsTable";
import { CartWalletSummary } from "../components/CartWalletSummary";
import { ScanReceiptModal } from "../components/ScanReceiptModal";
import { InvoiceItemsEditor } from "../components/InvoiceItemsEditor";
import {
  legsPriceTotalPaise,
  legsPurchaseTotalPaise,
  areLegsValid,
} from "../legs";
import { updatePurchaseTrip, createTripActivity } from "../data";
import { useMember } from "@/features/auth/useMember";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { Modal } from "@/components/ui/Modal";
import { PageHeading } from "@/components/ui/PageHeading";
import { Tabs } from "@/components/ui/tabs/Tabs";
import {
  createPurchaseInvoice,
  createTripExpense,
  deletePurchaseInvoice,
  deleteTripExpense,
} from "../data";
import { calculateLandedCost } from "@/lib/landedCost";
import { suggestedMrpPaise, type MarginRecipe } from "@/lib/purchaseMargin";
import { formatInr, rupeesToPaise } from "@/lib/money";

const EXPENSE_CATEGORIES = [
  "travel",
  "lodging",
  "food",
  "transport",
  "other",
] as const;

function marginConfigOf(inv: PurchaseInvoice) {
  if (inv.margin_config)
    return { recipe: inv.margin_config as unknown as MarginRecipe };
  if (inv.margin_plugin_id) return { pluginId: inv.margin_plugin_id };
  return { recipe: { type: "flat", pct: 0 } as MarginRecipe };
}

function safeMrp(
  landedUnitCostPaise: number,
  isTrending: boolean,
  inv: PurchaseInvoice,
) {
  try {
    return suggestedMrpPaise(
      { landedUnitCostPaise, isTrending },
      marginConfigOf(inv),
    );
  } catch {
    return null;
  }
}

export default function PurchaseTripDetailPage() {
  const { orgId, tripLocalId } = useParams<{
    orgId: string;
    tripLocalId: string;
  }>();

  const trip = useLiveQuery(
    () => (tripLocalId ? db.purchase_trips.get(tripLocalId) : undefined),
    [tripLocalId],
  );
  const tripId = trip?.id;

  const expenses = useLiveQuery(async () => {
    if (!tripId) return [];
    return (
      await db.trip_expenses.where("trip_id").equals(tripId).toArray()
    ).filter((e) => !e.deleted_at);
  }, [tripId]);

  const bundle = useLiveQuery(async () => {
    if (!tripId) return { invoices: [], items: [] };
    const invoices = (
      await db.purchase_invoices.where("trip_id").equals(tripId).toArray()
    ).filter((i) => !i.deleted_at);
    const ids = invoices.map((i) => i.id).filter((x): x is string => !!x);
    const items = ids.length
      ? (
          await db.purchase_invoice_items
            .where("invoice_id")
            .anyOf(ids)
            .toArray()
        ).filter((i) => !i.deleted_at)
      : [];
    return { invoices, items };
  }, [tripId]);

  const invoices = useMemo(() => bundle?.invoices ?? [], [bundle]);
  const items = useMemo(() => bundle?.items ?? [], [bundle]);
  const invoiceById = useMemo(
    () => new Map(invoices.map((i) => [i.id, i] as const)),
    [invoices],
  );

  const totalExpensesPaise = (expenses ?? []).reduce(
    (s, e) => s + e.amount_paise,
    0,
  );

  // Landed cost across every item on the trip (by value).
  const landed = useMemo(() => {
    if (!items.length) return null;
    return calculateLandedCost(
      items.map((it) => ({
        id: it._localId,
        quantity: it.quantity,
        unitCostPaise: it.unit_cost_paise,
      })),
      totalExpensesPaise,
      "value",
    );
  }, [items, totalExpensesPaise]);
  const landedByLocalId = useMemo(
    () => new Map((landed?.items ?? []).map((r) => [r.id, r] as const)),
    [landed],
  );

  const summary = useMemo(() => {
    const totalGoods = items.reduce(
      (s, it) => s + it.quantity * it.unit_cost_paise,
      0,
    );
    let projectedRevenue = 0;
    for (const it of items) {
      const lr = landedByLocalId.get(it._localId);
      const inv = invoiceById.get(it.invoice_id);
      if (!lr || !inv) continue;
      const mrp = safeMrp(lr.landedUnitCostPaise, it.is_trending, inv);
      if (mrp != null) projectedRevenue += mrp * it.quantity;
    }
    const totalLanded = totalGoods + totalExpensesPaise;
    const blended =
      totalLanded > 0 ? (projectedRevenue - totalLanded) / totalLanded : 0;
    return { totalGoods, totalLanded, projectedRevenue, blended };
  }, [items, landedByLocalId, invoiceById, totalExpensesPaise]);

  // Route editing: local copy synced when the trip loads; saved on demand (so we don't
  // enqueue an outbox write on every keystroke).
  const { member } = useMember();
  const [scanOpen, setScanOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("summary");
  const [noteText, setNoteText] = useState("");
  const activities = useLiveQuery(async () => {
    if (!tripId) return [];
    return (await db.trip_activities.where("trip_id").equals(tripId).toArray())
      .filter((a) => !a.deleted_at)
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }, [tripId]);
  // Offline-captured receipts for this trip (draining is handled app-wide by
  // ReceiptDrainManager; here we just show what's still queued + any last error).
  const pendingReceipts = useLiveQuery(
    () =>
      tripId
        ? db.pending_receipts.where("trip_id").equals(tripId).toArray()
        : Promise.resolve([] as PendingReceipt[]),
    [tripId],
  );

  const [legs, setLegs] = useState<TripRouteLeg[]>([]);
  const [routeDirty, setRouteDirty] = useState(false);
  const [routeError, setRouteError] = useState(false);
  useEffect(() => {
    setLegs(trip?.route ?? []);
    setRouteDirty(false);
    setRouteError(false);
  }, [trip?._localId, trip?.route]);

  const saveRoute = async () => {
    if (!trip?._localId) return;
    if (!areLegsValid(legs)) {
      setRouteError(true);
      return;
    }
    setRouteError(false);
    await updatePurchaseTrip(trip._localId, {
      route: legs.length ? legs : null,
    });
    setRouteDirty(false);
  };

  // Planned vs actual travel/expenses.
  const plannedTravel = legsPriceTotalPaise(trip?.route ?? []);
  const plannedExpenses = trip?.estimated_expenses_paise ?? 0;
  const actualTravel = (expenses ?? [])
    .filter((e) => e.category === "travel")
    .reduce((s, e) => s + e.amount_paise, 0);
  const actualExpenses = totalExpensesPaise;

  if (!orgId || !tripLocalId) return null;
  if (trip === undefined)
    return <p className="text-sm text-fg-muted">Loading…</p>;
  if (trip === null || !tripId)
    return <p className="text-sm text-fg-muted">Trip not found.</p>;

  const now = () => new Date().toISOString();
  const logActivity = (
    kind: Parameters<typeof createTripActivity>[0]["kind"],
    note: string | null,
  ) =>
    createTripActivity({
      trip_id: tripId,
      member_id: member?.id ?? null,
      kind,
      note,
      ref_invoice_id: null,
      occurred_at: now(),
    });

  const startTrip = async () => {
    await updatePurchaseTrip(trip._localId, {
      status: "active",
      started_at: now(),
    });
    await logActivity("started", null);
  };
  const completeTrip = async () => {
    await updatePurchaseTrip(trip._localId, {
      status: "completed",
      completed_at: now(),
    });
    await logActivity("completed", null);
  };
  const addNote = async () => {
    if (!noteText.trim()) return;
    await logActivity("note", noteText.trim());
    setNoteText("");
  };

  const ACTIVITY_LABEL: Record<string, string> = {
    started: "🚩 Trip started",
    completed: "✅ Trip completed",
    arrived: "📍 Arrived",
    expense: "💸 Expense",
    invoice: "🧾 Invoice",
    receipt_scan: "📷 Receipt scanned",
    note: "📝 Note",
  };

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <Link
            to={`/org/${orgId}/purchase-trips`}
            className="text-sm font-medium text-fg-muted hover:text-fg"
          >
            ← Back
          </Link>
        }
      >
        {trip.title}
      </PageHeading>

      <Card
        title={`Status: ${trip.status}`}
        desc={`${trip.started_at ? `started ${trip.started_at.slice(0, 10)}` : ""} ${trip.completed_at ? `completed ${trip.completed_at.slice(0, 10)}` : ""}`}
        actions={
          trip.status === "planning" ? (
            <Button type="button" onClick={startTrip}>
              Start trip
            </Button>
          ) : trip.status === "active" ? (
            <Button type="button" onClick={completeTrip}>
              Complete trip
            </Button>
          ) : null
        }
      >
        <Tabs
          activeId={activeSection}
          onChange={setActiveSection}
          items={[
            { id: "summary", label: "Summary" },
            { id: "invoices", label: "Invoices" },
            { id: "expenses", label: "Expenses" },
            { id: "journeyLog", label: "Journey Log" },
          ]}
        />
        {/* Summary */}
        {activeSection === "summary" && (
          <div className="space-y-8">
            <section>
              <div className="border-b border-border pb-4">
                <h2 className="text-base font-medium text-fg">Summary</h2>
                <p className="mt-1 text-sm text-fg-muted">
                  Landed cost + suggested MRP are computed, not stored.
                </p>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
                <Stat label="Goods" value={formatInr(summary.totalGoods)} />
                <Stat label="Expenses" value={formatInr(totalExpensesPaise)} />
                <Stat label="Landed total" value={formatInr(summary.totalLanded)} />
                <Stat label="Proj. revenue (MRP)" value={formatInr(summary.projectedRevenue)} />
                <Stat label="Blended margin" value={`${Math.round(summary.blended * 100)}%`} />
              </dl>
            </section>

            {/* Route (planning) */}
            <section>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
                <div>
                  <h2 className="text-base font-medium text-fg">Route</h2>
                  <p className="mt-1 text-sm text-fg-muted">
                    Legs you'll travel. Click Verify on map to check each one.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2">
                  <CartWalletSummary
                    cartPaise={legsPurchaseTotalPaise(legs)}
                    budgetPaise={trip.planned_budget_paise}
                    expensesPaise={plannedExpenses}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={saveRoute}
                    disabled={!routeDirty}
                  >
                    {routeDirty ? "Save route" : "Saved"}
                  </Button>
                </div>
              </div>
              <div className="mt-5">
                <RouteLegsTable
                value={legs}
                onChange={(next) => {
                  setLegs(next);
                  setRouteDirty(true);
                }}
                showErrors={routeError}
              />
              {routeError && (
                <p className="mt-3 text-sm text-red-500">
                  Each leg needs From, To, and Distance (km) — open Verify on
                  map to read the distance.
                </p>
              )}
              </div>
            </section>

            {/* Planned vs actual */}
            <section>
              <div className="border-b border-border pb-4">
                <h2 className="text-base font-medium text-fg">Planned vs actual</h2>
                <p className="mt-1 text-sm text-fg-muted">How the plan held up.</p>
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-fg-muted">
                      <th className="pb-1 pr-4"></th>
                      <th className="pb-1 pr-4">Planned</th>
                      <th className="pb-1 pr-4">Actual</th>
                      <th className="pb-1">Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    <PvaRow
                      label="Travel"
                      planned={plannedTravel}
                      actual={actualTravel}
                    />
                    <PvaRow
                      label="All expenses"
                      planned={plannedExpenses}
                      actual={actualExpenses}
                    />
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

      {/* Expenses */}
      {activeSection === "expenses" && (
        <section>
          <div className="border-b border-border pb-4">
            <h2 className="text-base font-medium text-fg">Trip expenses</h2>
          </div>
          <div className="mt-5 space-y-3">
            {(expenses ?? []).map((e) => (
              <Row
                key={e._localId}
                left={`${e.category}${e.note ? ` — ${e.note}` : ""}`}
                right={formatInr(e.amount_paise)}
                dirty={e._dirty === 1}
                onDelete={() => deleteTripExpense(e._localId)}
              />
            ))}
            <AddExpenseForm tripId={tripId} />
          </div>
        </section>
      )}

      {/* Invoices + items */}
      {activeSection === "invoices" && (
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <h2 className="text-base font-medium text-fg">Supplier invoices</h2>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setManualOpen(true)}
              >
                Manual invoice
              </Button>
            <Button type="button" onClick={() => setScanOpen(true)}>
              Scan receipt 📷
            </Button>
            </div>
          </div>
          <div className="mt-5 space-y-5">
            {pendingReceipts && pendingReceipts.length > 0 && (
              <div className="rounded-lg border border-border bg-bg-elevated p-3 text-sm text-fg-muted">
                📴 {pendingReceipts.length} receipt
                {pendingReceipts.length > 1 ? "s" : ""} captured offline — will
                be scanned &amp; synced automatically once you're back online.
                {pendingReceipts.some((r) => r.last_error) && (
                  <span className="mt-1 block text-red-500">
                    Last attempt failed:{" "}
                    {pendingReceipts.find((r) => r.last_error)?.last_error}. It
                    will retry, or you can add the invoice manually.
                  </span>
                )}
              </div>
            )}
            {invoices.map((inv) => (
              <InvoiceItemsEditor
                key={inv._localId}
                invoice={inv}
                items={items.filter((it) => it.invoice_id === inv.id)}
                landedByLocalId={landedByLocalId}
                onRemoveInvoice={() => deletePurchaseInvoice(inv._localId)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Journey log */}
      {activeSection === "journeyLog" && (
        <section>
          <div className="border-b border-border pb-4">
            <h2 className="text-base font-medium text-fg">Journey log</h2>
          </div>
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <Input
                label="Add a note"
                placeholder="e.g. Reached Surat, meeting supplier at 3pm"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
              <Button
                type="button"
                onClick={addNote}
                disabled={!noteText.trim()}
              >
                Add
              </Button>
            </div>
            {(activities ?? []).length === 0 ? (
              <p className="text-sm text-fg-muted">No activity yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(activities ?? []).map((a) => (
                  <li
                    key={a._localId}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="text-fg">
                      {ACTIVITY_LABEL[a.kind] ?? a.kind}
                      {a.note ? (
                        <span className="text-fg-muted"> — {a.note}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-fg-muted">
                      {a.occurred_at.slice(0, 16).replace("T", " ")}
                      {a._dirty === 1 && " ↑"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      </Card>

      <ScanReceiptModal
        tripId={tripId}
        orgId={orgId}
        open={scanOpen}
        onClose={() => setScanOpen(false)}
      />

      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Add invoice manually"
      >
        <AddInvoiceForm tripId={tripId} onAdded={() => setManualOpen(false)} />
      </Modal>
    </div>
  );
}

function PvaRow({
  label,
  planned,
  actual,
}: {
  label: string;
  planned: number;
  actual: number;
}) {
  const diff = actual - planned;
  return (
    <tr className="border-t border-border">
      <td className="py-1 pr-4 text-fg-muted">{label}</td>
      <td className="py-1 pr-4">{formatInr(planned)}</td>
      <td className="py-1 pr-4">{formatInr(actual)}</td>
      <td className={`py-1 ${diff > 0 ? "text-red-500" : "text-fg"}`}>
        {diff > 0 ? "+" : ""}
        {formatInr(diff)}
      </td>
    </tr>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium text-fg">{value}</dd>
    </div>
  );
}

function Row({
  left,
  right,
  dirty,
  onDelete,
}: {
  left: string;
  right: string;
  dirty: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border pb-2 text-sm">
      <span className="text-fg">
        {left}
        {dirty && <span className="ml-2 text-xs text-amber-500">↑</span>}
      </span>
      <span className="flex items-center gap-3">
        <span className="text-fg">{right}</span>
        <button
          className="text-xs text-fg-muted hover:text-red-500"
          onClick={onDelete}
        >
          ✕
        </button>
      </span>
    </div>
  );
}

function AddExpenseForm({ tripId }: { tripId: string }) {
  const [category, setCategory] = useState<string>("travel");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const add = async () => {
    const paise = rupeesToPaise(amount);
    if (paise == null) return;
    await createTripExpense({
      trip_id: tripId,
      category: category as (typeof EXPENSE_CATEGORIES)[number],
      amount_paise: paise,
      note: note.trim() || null,
    });
    setAmount("");
    setNote("");
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <SingleSelect
        label="Category"
        options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder={null}
      />
      <Input
        label="Amount"
        type="number"
        inputMode="decimal"
        suffix="₹"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Input
        label="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        type="button"
        onClick={add}
        disabled={rupeesToPaise(amount) == null}
      >
        Add expense
      </Button>
    </div>
  );
}

function AddInvoiceForm({
  tripId,
  onAdded,
}: {
  tripId: string;
  onAdded?: () => void;
}) {
  const [supplier, setSupplier] = useState("");
  const [marginType, setMarginType] = useState("flat");
  const [basePct, setBasePct] = useState("20");
  const [trendingPct, setTrendingPct] = useState("60");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!supplier.trim()) return;
    setSaving(true);
    try {
      const base = Number(basePct) / 100;
      const trend = Number(trendingPct) / 100;
      const margin_config =
        marginType === "trending"
          ? { type: "trending", basePct: base, trendingPct: trend }
          : { type: "flat", pct: base };
      await createPurchaseInvoice({
        trip_id: tripId,
        supplier_name: supplier.trim(),
        supplier_gstin: null,
        supplier_invoice_no: null,
        invoice_date: null,
        margin_config,
        margin_plugin_id: null,
        notes: null,
        source: "manual",
        receipt_path: null,
        ai_confidence: null,
        needs_review: false,
      });
      setSupplier("");
      onAdded?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Input
        label="Supplier"
        placeholder="Surat Silk Mills"
        value={supplier}
        onChange={(e) => setSupplier(e.target.value)}
      />
      <SingleSelect
        label="Margin"
        options={[
          { value: "flat", label: "Flat" },
          { value: "trending", label: "Trending boost" },
        ]}
        value={marginType}
        onChange={(e) => setMarginType(e.target.value)}
        placeholder={null}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={marginType === "trending" ? "Base %" : "Margin %"}
          type="number"
          suffix="%"
          value={basePct}
          onChange={(e) => setBasePct(e.target.value)}
        />
        {marginType === "trending" && (
          <Input
            label="Trending %"
            type="number"
            suffix="%"
            value={trendingPct}
            onChange={(e) => setTrendingPct(e.target.value)}
          />
        )}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={add}
          disabled={!supplier.trim() || saving}
        >
          {saving ? "Adding…" : "Add invoice"}
        </Button>
      </div>
    </div>
  );
}

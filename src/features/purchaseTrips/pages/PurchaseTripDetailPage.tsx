import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import type { PurchaseInvoice, TripRouteLeg } from "@/db";
import { RouteLegsTable } from "../components/RouteLegsTable";
import { CartWalletSummary } from "../components/CartWalletSummary";
import { legsPriceTotalPaise, legsPurchaseTotalPaise, areLegsValid } from "../legs";
import { updatePurchaseTrip } from "../data";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { PageHeading } from "@/components/ui/PageHeading";
import {
  createPurchaseInvoice,
  createPurchaseInvoiceItem,
  createTripExpense,
  deletePurchaseInvoice,
  deletePurchaseInvoiceItem,
  deleteTripExpense,
} from "../data";
import { calculateLandedCost } from "@/lib/landedCost";
import { suggestedMrpPaise, type MarginRecipe } from "@/lib/purchaseMargin";
import { formatInr, rupeesToPaise } from "@/lib/money";

const EXPENSE_CATEGORIES = ["travel", "lodging", "food", "transport", "other"] as const;

function marginConfigOf(inv: PurchaseInvoice) {
  if (inv.margin_config) return { recipe: inv.margin_config as unknown as MarginRecipe };
  if (inv.margin_plugin_id) return { pluginId: inv.margin_plugin_id };
  return { recipe: { type: "flat", pct: 0 } as MarginRecipe };
}

function safeMrp(landedUnitCostPaise: number, isTrending: boolean, inv: PurchaseInvoice) {
  try {
    return suggestedMrpPaise({ landedUnitCostPaise, isTrending }, marginConfigOf(inv));
  } catch {
    return null;
  }
}

export default function PurchaseTripDetailPage() {
  const { orgId, tripLocalId } = useParams<{ orgId: string; tripLocalId: string }>();

  const trip = useLiveQuery(
    () => (tripLocalId ? db.purchase_trips.get(tripLocalId) : undefined),
    [tripLocalId],
  );
  const tripId = trip?.id;

  const expenses = useLiveQuery(async () => {
    if (!tripId) return [];
    return (await db.trip_expenses.where("trip_id").equals(tripId).toArray()).filter(
      (e) => !e.deleted_at,
    );
  }, [tripId]);

  const bundle = useLiveQuery(async () => {
    if (!tripId) return { invoices: [], items: [] };
    const invoices = (
      await db.purchase_invoices.where("trip_id").equals(tripId).toArray()
    ).filter((i) => !i.deleted_at);
    const ids = invoices.map((i) => i.id).filter((x): x is string => !!x);
    const items = ids.length
      ? (await db.purchase_invoice_items.where("invoice_id").anyOf(ids).toArray()).filter(
          (i) => !i.deleted_at,
        )
      : [];
    return { invoices, items };
  }, [tripId]);

  const invoices = useMemo(() => bundle?.invoices ?? [], [bundle]);
  const items = useMemo(() => bundle?.items ?? [], [bundle]);
  const invoiceById = useMemo(
    () => new Map(invoices.map((i) => [i.id, i] as const)),
    [invoices],
  );

  const totalExpensesPaise = (expenses ?? []).reduce((s, e) => s + e.amount_paise, 0);

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
    const totalGoods = items.reduce((s, it) => s + it.quantity * it.unit_cost_paise, 0);
    let projectedRevenue = 0;
    for (const it of items) {
      const lr = landedByLocalId.get(it._localId);
      const inv = invoiceById.get(it.invoice_id);
      if (!lr || !inv) continue;
      const mrp = safeMrp(lr.landedUnitCostPaise, it.is_trending, inv);
      if (mrp != null) projectedRevenue += mrp * it.quantity;
    }
    const totalLanded = totalGoods + totalExpensesPaise;
    const blended = totalLanded > 0 ? (projectedRevenue - totalLanded) / totalLanded : 0;
    return { totalGoods, totalLanded, projectedRevenue, blended };
  }, [items, landedByLocalId, invoiceById, totalExpensesPaise]);

  // Route editing: local copy synced when the trip loads; saved on demand (so we don't
  // enqueue an outbox write on every keystroke).
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
    await updatePurchaseTrip(trip._localId, { route: legs.length ? legs : null });
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
  if (trip === undefined) return <p className="text-sm text-fg-muted">Loading…</p>;
  if (trip === null || !tripId)
    return <p className="text-sm text-fg-muted">Trip not found.</p>;

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

      {/* Summary */}
      <Card title="Summary" desc="Landed cost + suggested MRP are computed, not stored.">
        <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
          <Stat label="Goods" value={formatInr(summary.totalGoods)} />
          <Stat label="Expenses" value={formatInr(totalExpensesPaise)} />
          <Stat label="Landed total" value={formatInr(summary.totalLanded)} />
          <Stat
            label="Proj. revenue (MRP)"
            value={formatInr(summary.projectedRevenue)}
          />
          <Stat label="Blended margin" value={`${Math.round(summary.blended * 100)}%`} />
        </dl>
      </Card>

      {/* Route (planning) */}
      <Card
        title="Route"
        desc="Legs you'll travel. Click Verify on map to check each one."
        actions={
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
        }
      >
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
            Each leg needs From, To, and Distance (km) — open Verify on map to read the
            distance.
          </p>
        )}
      </Card>

      {/* Planned vs actual */}
      <Card title="Planned vs actual" desc="How the plan held up.">
        <div className="overflow-x-auto">
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
              <PvaRow label="Travel" planned={plannedTravel} actual={actualTravel} />
              <PvaRow
                label="All expenses"
                planned={plannedExpenses}
                actual={actualExpenses}
              />
            </tbody>
          </table>
        </div>
      </Card>

      {/* Expenses */}
      <Card title="Trip expenses">
        <div className="space-y-3">
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
      </Card>

      {/* Invoices + items */}
      <Card title="Supplier invoices">
        <div className="space-y-5">
          {invoices.map((inv) => (
            <div key={inv._localId} className="rounded-lg border border-border p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-medium text-fg">{inv.supplier_name}</div>
                <button
                  className="text-xs text-fg-muted hover:text-red-500"
                  onClick={() => deletePurchaseInvoice(inv._localId)}
                >
                  Remove invoice
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-fg-muted">
                      <th className="pb-1 pr-3">Model</th>
                      <th className="pb-1 pr-3">Qty</th>
                      <th className="pb-1 pr-3">Unit cost</th>
                      <th className="pb-1 pr-3">Trending</th>
                      <th className="pb-1 pr-3">Landed / unit</th>
                      <th className="pb-1 pr-3">MRP</th>
                      <th className="pb-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items
                      .filter((it) => it.invoice_id === inv.id)
                      .map((it) => {
                        const lr = landedByLocalId.get(it._localId);
                        const mrp = lr
                          ? safeMrp(lr.landedUnitCostPaise, it.is_trending, inv)
                          : null;
                        return (
                          <tr key={it._localId} className="border-t border-border">
                            <td className="py-1 pr-3">{it.description}</td>
                            <td className="py-1 pr-3">{it.quantity}</td>
                            <td className="py-1 pr-3">{formatInr(it.unit_cost_paise)}</td>
                            <td className="py-1 pr-3">{it.is_trending ? "Yes" : "—"}</td>
                            <td className="py-1 pr-3">
                              {lr ? formatInr(lr.landedUnitCostPaise) : "—"}
                            </td>
                            <td className="py-1 pr-3">{mrp != null ? formatInr(mrp) : "—"}</td>
                            <td className="py-1">
                              <button
                                className="text-xs text-fg-muted hover:text-red-500"
                                onClick={() => deletePurchaseInvoiceItem(it._localId)}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3">
                <AddItemForm invoiceId={inv.id!} />
              </div>
            </div>
          ))}

          <AddInvoiceForm tripId={tripId} />
        </div>
      </Card>
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
        <button className="text-xs text-fg-muted hover:text-red-500" onClick={onDelete}>
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
      <Button type="button" onClick={add} disabled={rupeesToPaise(amount) == null}>
        Add expense
      </Button>
    </div>
  );
}

function AddInvoiceForm({ tripId }: { tripId: string }) {
  const [supplier, setSupplier] = useState("");
  const [marginType, setMarginType] = useState("flat");
  const [basePct, setBasePct] = useState("20");
  const [trendingPct, setTrendingPct] = useState("60");

  const add = async () => {
    if (!supplier.trim()) return;
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
    });
    setSupplier("");
  };

  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
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
      <Button type="button" onClick={add} disabled={!supplier.trim()}>
        Add invoice
      </Button>
    </div>
  );
}

function AddItemForm({ invoiceId }: { invoiceId: string }) {
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [trending, setTrending] = useState(false);

  const add = async () => {
    const quantity = Number(qty);
    const unit = rupeesToPaise(unitCost);
    if (!description.trim() || !Number.isInteger(quantity) || quantity <= 0 || unit == null)
      return;
    await createPurchaseInvoiceItem({
      invoice_id: invoiceId,
      description: description.trim(),
      hsn_code: null,
      quantity,
      unit_cost_paise: unit,
      is_trending: trending,
    });
    setDescription("");
    setQty("");
    setUnitCost("");
    setTrending(false);
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input
        label="Model"
        placeholder="Cotton saree"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Input
        label="Qty"
        type="number"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
      />
      <Input
        label="Unit cost"
        type="number"
        inputMode="decimal"
        suffix="₹"
        value={unitCost}
        onChange={(e) => setUnitCost(e.target.value)}
      />
      <label className="mb-2 flex items-center gap-2 text-sm text-fg">
        <input
          type="checkbox"
          checked={trending}
          onChange={(e) => setTrending(e.target.checked)}
        />
        Trending
      </label>
      <Button type="button" onClick={add}>
        Add item
      </Button>
    </div>
  );
}

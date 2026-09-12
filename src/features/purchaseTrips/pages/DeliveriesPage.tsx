import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { PageHeading } from "@/components/ui/PageHeading";
import { Button } from "@/components/ui/Button";
import { useMember } from "@/features/auth/useMember";
import {
  RECEIVING_STAGES,
  RECEIVING_LABEL,
  RECEIVING_BADGE,
  RECEIVING_ICON,
  advanceReceiving,
  type ReceivingStatus,
} from "../receiving";

/** Inline one-tap label for the two transport bumps; null for stages that need the detail page. */
const INLINE_ADVANCE: Partial<Record<ReceivingStatus, string>> = {
  pending: "🚚 Mark in transit",
  in_transit: "📦 Mark received",
};

/**
 * Deliveries — the post-trip receiving workspace. Lists every COMPLETED trip's supplier
 * invoices (parcels) at parcel level; clicking one opens its receiving detail (stepper +
 * line-level goods check). Org-level (trip.create). `approved` hands off to inventory (M3).
 */
export default function DeliveriesPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { member } = useMember();
  const [stage, setStage] = useState<string>("all");
  const [q, setQ] = useState("");

  const rows = useLiveQuery(async () => {
    if (!orgId) return [];
    const trips = (
      await db.purchase_trips.where("organization_id").equals(orgId).toArray()
    ).filter((t) => !t.deleted_at && t.status === "completed");
    const tripById = new Map(trips.map((t) => [t.id, t] as const));
    const tripIds = trips.map((t) => t.id).filter((x): x is string => !!x);
    if (!tripIds.length) return [];

    const invoices = (
      await db.purchase_invoices.where("trip_id").anyOf(tripIds).toArray()
    ).filter((i) => !i.deleted_at);
    const invIds = invoices.map((i) => i.id).filter((x): x is string => !!x);
    const items = invIds.length
      ? (
          await db.purchase_invoice_items.where("invoice_id").anyOf(invIds).toArray()
        ).filter((it) => !it.deleted_at)
      : [];
    const aggByInvoice = new Map<
      string,
      { count: number; qty: number; checked: number }
    >();
    for (const it of items) {
      const cur =
        aggByInvoice.get(it.invoice_id) ?? { count: 0, qty: 0, checked: 0 };
      cur.count += 1;
      cur.qty += it.quantity;
      if (it.received_quantity != null) cur.checked += 1;
      aggByInvoice.set(it.invoice_id, cur);
    }

    return invoices
      .map((inv) => {
        const agg =
          aggByInvoice.get(inv.id ?? "") ?? { count: 0, qty: 0, checked: 0 };
        return {
          inv,
          tripTitle: tripById.get(inv.trip_id)?.title ?? "—",
          itemCount: agg.count,
          totalQty: agg.qty,
          checkedCount: agg.checked,
        };
      })
      .sort((a, b) => {
        // Stable order: oldest invoice first, so changing a parcel's stage never reorders
        // the list. Missing invoice_date sorts last; supplier name is the final tiebreaker.
        const da = a.inv.invoice_date ?? "";
        const db_ = b.inv.invoice_date ?? "";
        if (da && db_ && da !== db_) return da.localeCompare(db_);
        if (da !== db_) return da ? -1 : 1; // one has a date, the other doesn't
        return a.inv.supplier_name.localeCompare(b.inv.supplier_name);
      });
  }, [orgId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (stage !== "all" && r.inv.receiving_status !== stage) return false;
      if (
        needle &&
        !r.inv.supplier_name.toLowerCase().includes(needle) &&
        !r.tripTitle.toLowerCase().includes(needle)
      )
        return false;
      return true;
    });
  }, [rows, stage, q]);

  if (!orgId) return null;

  const statusOptions = [
    { value: "all", label: "All statuses" },
    ...RECEIVING_STAGES.map((s) => ({ value: s, label: RECEIVING_LABEL[s] })),
  ];

  return (
    <div className="space-y-6">
      <PageHeading>Deliveries</PageHeading>
      <p className="-mt-2 text-sm text-fg-muted">
        Supplier parcels from completed trips. Open one to receive, verify (check each item),
        and approve; approved parcels are ready for inventory.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-56">
          <SingleSelect
            options={statusOptions}
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            placeholder={null}
          />
        </div>
        <div className="sm:w-64">
          <Input
            placeholder="Search supplier or trip"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {rows === undefined ? (
        <p className="text-sm text-fg-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-fg-muted">
            {(rows ?? []).length === 0
              ? "No parcels yet. Invoices from completed trips show up here to receive."
              : "No parcels match this filter."}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ inv, tripTitle, itemCount, totalQty, checkedCount }) => {
            const status = inv.receiving_status;
            const inlineLabel = INLINE_ADVANCE[status];
            const onAdvance = async (e: React.MouseEvent) => {
              // Bump the stage in place — don't follow the row's link into the detail page.
              e.preventDefault();
              e.stopPropagation();
              await advanceReceiving(inv, member?.id ?? null);
            };
            return (
              <Link
                key={inv._localId}
                to={inv._localId}
                className="flex items-center gap-3 rounded-lg border border-border bg-bg-elevated p-4 hover:border-fg-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-fg">{inv.supplier_name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${RECEIVING_BADGE[status]}`}
                    >
                      {RECEIVING_ICON[status]} {RECEIVING_LABEL[status]}
                    </span>
                    {inv.needs_review && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-600">
                        ⚠ review
                      </span>
                    )}
                    {status === "received" && itemCount > 0 && (
                      <span className="text-xs text-fg-muted">
                        {checkedCount}/{itemCount} checked
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-fg-muted">
                    {tripTitle}
                    {inv.supplier_invoice_no ? ` · #${inv.supplier_invoice_no}` : ""}
                    {` · ${itemCount} item${itemCount === 1 ? "" : "s"}`}
                    {totalQty ? ` · ${totalQty} pcs` : ""}
                  </div>
                </div>
                {inlineLabel && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onAdvance}
                    className="shrink-0"
                  >
                    {inlineLabel}
                  </Button>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

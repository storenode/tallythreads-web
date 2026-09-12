import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { useMember } from "@/features/auth/useMember";
import {
  updatePurchaseInvoice,
  updatePurchaseInvoiceItem,
} from "../data";
import { ReceivingStepper } from "../components/ReceivingStepper";
import {
  RECEIVING_LABEL,
  RECEIVING_BADGE,
  RECEIVING_ICON,
  nextReceivingStage,
  advanceLabel,
  advanceReceiving,
} from "../receiving";

export default function DeliveryDetailPage() {
  const { orgId, invoiceLocalId } = useParams<{
    orgId: string;
    invoiceLocalId: string;
  }>();
  const { member } = useMember();

  // Route param is normally the Dexie _localId; fall back to the server id (mirrors the
  // trip detail). null (not undefined) means genuinely absent so guards can tell.
  const invoice = useLiveQuery(async () => {
    if (!invoiceLocalId) return null;
    const byLocal = await db.purchase_invoices.get(invoiceLocalId);
    if (byLocal) return byLocal;
    const byId = await db.purchase_invoices
      .where("id")
      .equals(invoiceLocalId)
      .first();
    return byId ?? null;
  }, [invoiceLocalId]);

  // Stable display order for the check list: line items have no created_at or line number,
  // and _localId is a random UUID, so editing a row's received_quantity bumps last_modified_at
  // and would reorder the list. Freeze each item's position the first time it's seen (in its
  // initial last_modified_at order) so edits never move rows around.
  const orderRef = useRef(new Map<string, number>());
  const invId = invoice?.id;
  const items = useLiveQuery(async () => {
    if (!invId) return [];
    const rows = (
      await db.purchase_invoice_items.where("invoice_id").equals(invId).toArray()
    ).filter((it) => !it.deleted_at);
    const order = orderRef.current;
    rows
      .filter((it) => !order.has(it._localId))
      .sort((a, b) => a.last_modified_at.localeCompare(b.last_modified_at))
      .forEach((it) => order.set(it._localId, order.size));
    return rows.sort(
      (a, b) => (order.get(a._localId) ?? 0) - (order.get(b._localId) ?? 0),
    );
  }, [invId]);

  const tripTitle = useLiveQuery(async () => {
    if (!invoice?.trip_id) return "";
    const t = await db.purchase_trips
      .where("id")
      .equals(invoice.trip_id)
      .first();
    return t?.title ?? "";
  }, [invoice?.trip_id]);

  if (!orgId || !invoiceLocalId) return null;
  if (invoice === undefined)
    return <p className="text-sm text-fg-muted">Loading…</p>;
  if (invoice === null)
    return <p className="text-sm text-fg-muted">Invoice not found.</p>;

  const status = invoice.receiving_status;
  const canCheck = status === "received"; // line-level check editable only while receiving
  const itemList = items ?? [];
  const checkedCount = itemList.filter((it) => it.received_quantity != null).length;
  const allChecked = itemList.length > 0 && checkedCount === itemList.length;
  const advance = async () => {
    const next = nextReceivingStage(status);
    if (!next) return;
    if (next === "verified" && !allChecked) return; // forced check gate
    await advanceReceiving(invoice, member?.id ?? null);
  };

  const saveItem = (
    localId: string,
    changes: { received_quantity?: number | null; receiving_note?: string | null },
  ) => void updatePurchaseInvoiceItem(localId, changes);

  const label = advanceLabel(status);
  const verifyBlocked = nextReceivingStage(status) === "verified" && !allChecked;

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <Link
            to={`/org/${orgId}/deliveries`}
            className="text-sm font-medium text-fg-muted hover:text-fg"
          >
            ← Deliveries
          </Link>
        }
      >
        {invoice.supplier_name}
      </PageHeading>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-xs ${RECEIVING_BADGE[status]}`}
              >
                {RECEIVING_ICON[status]} {RECEIVING_LABEL[status]}
              </span>
              {invoice.needs_review && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-600">
                  ⚠ review
                </span>
              )}
            </div>
            <div className="mt-1 text-sm text-fg-muted">
              {tripTitle}
              {invoice.supplier_invoice_no ? ` · #${invoice.supplier_invoice_no}` : ""}
            </div>
          </div>
          {label ? (
            <Button type="button" onClick={advance} disabled={verifyBlocked}>
              {label}
            </Button>
          ) : (
            <span className="text-sm text-tt-green-600">
              ✅ Ready for Inventory
            </span>
          )}
        </div>

        <div className="mt-6">
          <ReceivingStepper status={status} />
        </div>

        {status === "received" && (
          <p className="mt-4 text-sm text-fg-muted">
            Check each item below (enter the quantity actually received), then Verify.{" "}
            <span className={allChecked ? "text-tt-green-600" : "text-amber-600"}>
              {checkedCount} of {itemList.length} items checked
            </span>
            .
          </p>
        )}
      </Card>

      <Card title={canCheck ? "Check items" : "Items"}>
        {itemList.length === 0 ? (
          <p className="text-sm text-fg-muted">No line items on this invoice.</p>
        ) : canCheck ? (
          /* Received stage → editable manual check (received qty + comment per line). */
          <div className="space-y-4">
            {itemList.map((it) => {
              const short =
                it.received_quantity != null && it.received_quantity !== it.quantity;
              return (
                <div
                  key={it._localId}
                  className="border-b border-border pb-4 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-fg">{it.description}</span>
                    <span className="text-sm text-fg-muted">Invoiced: {it.quantity}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[8rem_1fr]">
                    <Input
                      label="Received qty"
                      type="number"
                      inputMode="numeric"
                      defaultValue={
                        it.received_quantity == null ? "" : String(it.received_quantity)
                      }
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const n = v === "" ? null : Math.max(0, Math.round(Number(v)));
                        saveItem(it._localId, {
                          received_quantity:
                            n == null || Number.isFinite(n) ? n : null,
                        });
                      }}
                    />
                    <Input
                      label="Comment"
                      placeholder="e.g. 2 pieces torn"
                      defaultValue={it.receiving_note ?? ""}
                      onBlur={(e) =>
                        saveItem(it._localId, {
                          receiving_note: e.target.value.trim() || null,
                        })
                      }
                    />
                  </div>
                  {short && (
                    <p className="mt-2 text-xs text-amber-600">
                      {it.received_quantity! < it.quantity ? "Shortage" : "Excess"}:
                      received {it.received_quantity} of {it.quantity}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Every other stage → read-only grid. */
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-fg-muted">
                  <th className="pb-2 pr-4">Model</th>
                  <th className="pb-2 pr-4">Invoiced</th>
                  <th className="pb-2 pr-4">Received</th>
                  <th className="pb-2">Comment</th>
                </tr>
              </thead>
              <tbody>
                {itemList.map((it) => {
                  const short =
                    it.received_quantity != null &&
                    it.received_quantity !== it.quantity;
                  return (
                    <tr key={it._localId} className="border-t border-border">
                      <td className="py-2 pr-4 text-fg">{it.description}</td>
                      <td className="py-2 pr-4 text-fg-muted">{it.quantity}</td>
                      <td className="py-2 pr-4">
                        <span className={short ? "text-amber-600" : "text-fg"}>
                          {it.received_quantity ?? "—"}
                        </span>
                        {short && (
                          <span className="ml-1 text-xs text-amber-600">
                            ({it.received_quantity! < it.quantity ? "short" : "excess"})
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-fg-muted">{it.receiving_note ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Invoice comments">
        <p className="mb-2 text-sm text-fg-muted">
          Notes for future dealings with this supplier — reopen them next time you talk to the
          manufacturer.
        </p>
        <Textarea
          defaultValue={invoice.notes ?? ""}
          placeholder="e.g. Agreed to replace the torn pieces on the next order."
          onBlur={(e) =>
            void updatePurchaseInvoice(invoice._localId, {
              notes: e.target.value.trim() || null,
            })
          }
        />
      </Card>
    </div>
  );
}

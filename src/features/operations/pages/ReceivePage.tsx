import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Minus, Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { useMember } from "@/features/auth/useMember";
import { hasPermission, useEntitlements } from "@/features/auth/entitlements";
import {
  parseDestKey,
  receiveTransfer,
  useInvalidateInventory,
  useStoreDestinations,
  useStoreIncoming,
} from "@/features/inventory/distribution";
import { ScanInput } from "@/features/inventory/ScanInput";
import { ReceiptLink } from "@/features/inventory/DispatchPanel";
import { shipmentSummary } from "@/features/inventory/shipment";

/**
 * Receive one dispatch at the store (`/ops/:storeId/inventory/receive/:transferId`,
 * specs/roadmap/inventory.md §8). Staff scan each label (or tap +/−, or "all arrived"), pick
 * where the parcel goes (a stock room by default), and confirm. Shortages and extras are
 * recorded by the server against the dispatch. Needs a connection (server-side step).
 */
export default function ReceivePage() {
  const { storeId, transferId } = useParams<{ storeId: string; transferId: string }>();
  const navigate = useNavigate();
  const { member } = useMember();
  const { data: entitlements } = useEntitlements(member?.id);
  const canWrite = hasPermission(entitlements, "inventory.write", { storeId });
  const incoming = useStoreIncoming(storeId);
  const destinations = useStoreDestinations(storeId);
  const invalidate = useInvalidateInventory();

  const transfer = incoming.data?.find((t) => t.id === transferId);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [unknown, setUnknown] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default destination: the first stock room, else unplaced.
  const defaultDest = useMemo(
    () => destinations?.find((d) => d.group === "Stock room")?.key ?? destinations?.[0]?.key ?? "|",
    [destinations],
  );
  const destValue = destination ?? defaultDest;

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 1500);
    return () => window.clearTimeout(t);
  }, [flash]);

  if (incoming.isLoading || destinations === undefined) {
    return <p className="text-sm text-fg-muted">Loading…</p>;
  }
  if (!transfer) {
    return (
      <Card>
        <p className="text-sm text-fg-muted">
          {incoming.error ? "Receiving needs a connection. " : "This dispatch isn't waiting at this store. "}
          <Link to={`/ops/${storeId}/inventory`} className="text-tt-green-600 hover:underline">
            Back to Inventory
          </Link>
        </p>
      </Card>
    );
  }

  const received = transfer.status === "received";
  const sent = transfer.items.reduce((n, i) => n + i.qty_sent, 0);
  const got = transfer.items.reduce((n, i) => n + (counts[i.item_id] ?? 0), 0);
  const short = transfer.items.reduce((n, i) => n + Math.max(0, i.qty_sent - (counts[i.item_id] ?? 0)), 0);
  const extra = transfer.items.reduce((n, i) => n + Math.max(0, (counts[i.item_id] ?? 0) - i.qty_sent), 0);

  const bump = (itemId: string, d: number) =>
    setCounts((c) => ({ ...c, [itemId]: Math.max(0, (c[itemId] ?? 0) + d) }));

  const onScan = (sku: string) => {
    const it = transfer.items.find((i) => i.sku === sku);
    if (!it) {
      setUnknown((u) => (u.includes(sku) ? u : [...u, sku]));
      setFlash(`${sku} isn't in this dispatch`);
      return;
    }
    bump(it.item_id, 1);
    setFlash(`+1 ${it.name} · ${it.color} · ${it.size}`);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await receiveTransfer(
        transfer.id,
        transfer.items.map((i) => ({ item_id: i.item_id, qty_received: counts[i.item_id] ?? 0 })),
        parseDestKey(destValue),
      );
      await invalidate();
      navigate(`/ops/${storeId}/inventory`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <Link to={`/ops/${storeId}/inventory`} className="text-sm font-medium text-fg-muted hover:text-fg">
            ← Inventory
          </Link>
        }
      >
        Receive dispatch
      </PageHeading>
      <p className="-mt-4 text-sm text-fg-muted">
        Sent {transfer.dispatched_at.slice(0, 10)} · {transfer.items.length} SKU
        {transfer.items.length === 1 ? "" : "s"} · {sent} pcs
        {transfer.note ? ` · ${transfer.note}` : ""}
      </p>
      {transfer.shipment?.transport_mode && (
        <div className="-mt-3 flex flex-wrap items-center gap-x-3 text-sm text-fg">
          <span className="inline-flex items-center gap-1.5">
            <Truck size={16} className="text-fg-muted" />
            {shipmentSummary(transfer.shipment, "store")}
          </span>
          {transfer.shipment.contact_phone && (
            <a href={`tel:${transfer.shipment.contact_phone}`} className="inline-flex min-h-11 items-center text-brand hover:underline">
              {transfer.shipment.contact_name ? `${transfer.shipment.contact_name} · ` : ""}
              {transfer.shipment.contact_phone}
            </a>
          )}
          {transfer.shipment.receipt_path && <ReceiptLink path={transfer.shipment.receipt_path} />}
        </div>
      )}

      {received ? (
        <Card>
          <p className="flex items-center gap-2 text-sm text-success-text">
            <CheckCircle2 size={18} /> Received {transfer.received_at?.slice(0, 10)}.
          </p>
        </Card>
      ) : !canWrite ? (
        <Card>
          <p className="text-sm text-fg-muted">Ask the store manager to receive this dispatch.</p>
        </Card>
      ) : (
        <Card title="Scan each piece" desc="Or use + / − per item. Counts save only when you confirm.">
          <ScanInput onScan={onScan} autoFocus />
          <p aria-live="polite" className="mt-2 min-h-5 text-sm text-fg-muted">
            {flash}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setCounts(Object.fromEntries(transfer.items.map((i) => [i.item_id, i.qty_sent])))}
            >
              Everything arrived
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCounts({})}>
              Reset counts
            </Button>
          </div>
        </Card>
      )}

      <Card title="Items">
        <ul className="divide-y divide-border">
          {transfer.items.map((i) => {
            const n = received ? (i.qty_received ?? 0) : (counts[i.item_id] ?? 0);
            const tone =
              n === i.qty_sent ? "text-success-text" : n > i.qty_sent ? "text-warning-text" : "text-fg";
            return (
              <li key={i.item_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate font-mono text-sm text-fg">{i.sku}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {i.name} · {i.color} · {i.size}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!received && canWrite && (
                    <button
                      type="button"
                      aria-label={`One less ${i.sku}`}
                      onClick={() => bump(i.item_id, -1)}
                      className="inline-flex size-11 items-center justify-center rounded-lg border border-border text-fg hover:bg-surface-2"
                    >
                      <Minus size={16} />
                    </button>
                  )}
                  <span className={`w-16 text-center text-sm font-semibold ${tone}`}>
                    {n} / {i.qty_sent}
                  </span>
                  {!received && canWrite && (
                    <button
                      type="button"
                      aria-label={`One more ${i.sku}`}
                      onClick={() => bump(i.item_id, 1)}
                      className="inline-flex size-11 items-center justify-center rounded-lg border border-border text-fg hover:bg-surface-2"
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {unknown.length > 0 && (
          <p className="mt-3 text-xs text-warning-text">
            Scanned but not in this dispatch: {unknown.join(", ")}. Set these aside and tell the organization.
          </p>
        )}
      </Card>

      {!received && canWrite && (
        <Card title="Confirm">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <SingleSelect
              label="Put the parcel in"
              placeholder={null}
              value={destValue}
              onChange={(e) => setDestination(e.target.value)}
              options={destinations.map((d) => ({
                value: d.key,
                label: d.group === "Display" ? `Display · ${d.label}` : d.label,
              }))}
            />
            <Button type="button" onClick={confirm} disabled={busy}>
              {busy ? "Saving…" : `Confirm ${got} of ${sent} received`}
            </Button>
          </div>
          {(short > 0 || extra > 0) && (
            <p className="mt-3 text-sm text-warning-text">
              {short > 0 && `${short} short`}
              {short > 0 && extra > 0 && " · "}
              {extra > 0 && `${extra} extra`} — recorded against this dispatch for the organization.
            </p>
          )}
          {error && <p className="mt-3 text-sm text-error-text">{error}</p>}
        </Card>
      )}
    </div>
  );
}

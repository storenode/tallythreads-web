import { useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ScanBarcode } from "lucide-react";
import { db } from "@/db";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatInr } from "@/lib/money";
import { useMember } from "@/features/auth/useMember";
import { useStoresByOrg } from "@/features/stores/stores";
import { parseSku, type ParsedSku } from "./codes";
import { normalizeSku, useOrgStockLevels, useStoreStock } from "./distribution";
import { ScanInput } from "./ScanInput";

/**
 * Header quick-scan (every header, the public home page included): scan a label and see what it
 * is. Read-only — it never writes. What it can show depends on who is looking:
 *   - anyone: what the barcode itself encodes (store, category, colour, size, label number);
 *   - in a store (/ops/:storeId): the item and where it sits in this store (store_stock, price-free,
 *     cached for offline);
 *   - in the org back-office (/org/:orgId): the catalogued item and its stock at the org, in
 *     transit and per store. Never the landed cost.
 */
export function ScanButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Scan a barcode"
        className={`inline-flex size-9 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg ${className}`}
      >
        <ScanBarcode className="size-5" />
      </button>
      {open && <BarcodeLookupDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function BarcodeLookupDialog({ onClose }: { onClose: () => void }) {
  const [scanned, setScanned] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="Scan a barcode">
      {scanned === null ? (
        <ScanInput label="Or type the SKU" onScan={setScanned} startWithCamera />
      ) : (
        <div className="space-y-4">
          <SkuResult raw={scanned} />
          <Button variant="ghost" className="w-full" onClick={() => setScanned(null)}>
            <ScanBarcode size={16} /> Scan another
          </Button>
        </div>
      )}
    </Modal>
  );
}

function SkuResult({ raw }: { raw: string }) {
  const { storeId, orgId } = useParams<{ storeId?: string; orgId?: string }>();
  const { isSignedIn } = useMember();
  const parsed = parseSku(raw);

  if (!parsed) {
    return (
      <div className="space-y-1">
        <p className="break-all font-mono text-sm text-fg">{normalizeSku(raw) || raw}</p>
        <p className="text-sm text-fg-muted">This isn&apos;t a TallyThreads label.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="break-all font-mono text-base font-semibold text-fg">{parsed.sku}</p>
        <p className="mt-0.5 text-xs text-fg-muted">From the barcode</p>
        <Facts
          rows={[
            parsed.unallocated
              ? ["Stock", `Unallocated · ${parsed.orgCode}`]
              : ["Store code", parsed.storeCode],
            ["Category", parsed.category],
            ["Colour", parsed.color],
            ["Size", parsed.size],
            ["Label no.", String(parsed.sequence)],
          ]}
        />
      </div>
      {!isSignedIn ? (
        <p className="text-sm text-fg-muted">Sign in to see the item name, MRP and stock.</p>
      ) : storeId ? (
        <StoreDetails storeId={storeId} sku={parsed.sku} />
      ) : orgId ? (
        <OrgDetails orgId={orgId} parsed={parsed} />
      ) : (
        <p className="text-sm text-fg-muted">Open a store or organization to see its stock.</p>
      )}
    </div>
  );
}

function StoreDetails({ storeId, sku }: { storeId: string; sku: string }) {
  const stock = useStoreStock(storeId);
  const rows = useMemo(() => (stock.data ?? []).filter((r) => r.sku === sku), [stock.data, sku]);

  if (stock.isLoading) return <p className="text-sm text-fg-muted">Looking it up…</p>;
  if (stock.error && !stock.data) {
    return <p className="text-sm text-fg-muted">Couldn&apos;t load this store&apos;s stock — check the connection.</p>;
  }
  if (!rows.length) return <p className="text-sm text-fg-muted">Not in this store&apos;s stock right now.</p>;

  const head = rows[0];
  const total = rows.reduce((n, r) => n + r.quantity, 0);
  return (
    <Section title={head.name}>
      <Facts
        rows={[
          ["Colour", head.color],
          ["Size", head.size],
          ["Category", head.category_code],
          ["MRP", formatInr(head.mrp_paise)],
          ["In this store", `${total} pcs`],
          ...rows.map(
            (r): [string, string] => [
              r.warehouse_id
                ? `${r.warehouse_name ?? "Stock room"}${r.location_code ? ` · ${r.location_code}` : ""}`
                : r.location_code
                  ? `Display · ${r.location_code}`
                  : "Not yet placed",
              `${r.quantity} pcs`,
            ],
          ),
        ]}
      />
    </Section>
  );
}

function OrgDetails({ orgId, parsed }: { orgId: string; parsed: ParsedSku }) {
  const item = useLiveQuery(
    () =>
      db.inventory_items
        .where("organization_id")
        .equals(orgId)
        .filter((i) => i.sku === parsed.sku && !i.deleted_at)
        .first(),
    [orgId, parsed.sku],
  );
  const levels = useOrgStockLevels(orgId);
  const { data: stores } = useStoresByOrg(orgId);

  if (item === undefined && levels.isLoading) return <p className="text-sm text-fg-muted">Looking it up…</p>;
  if (!item) return <p className="text-sm text-fg-muted">Not in this organization&apos;s catalogue.</p>;

  const storeName = (id: string | null) => (id ? (stores?.find((s) => s.id === id)?.name ?? "Store") : "Unallocated");
  const mine = (levels.data ?? []).filter((l) => l.item_id === item.id);
  const atOrg = mine.filter((l) => l.loc_kind === "org").reduce((n, l) => n + l.quantity, 0);
  const inTransit = mine.filter((l) => l.loc_kind === "transit").reduce((n, l) => n + l.quantity, 0);
  const byStore = new Map<string, number>();
  for (const l of mine) {
    if (l.loc_kind === "store" && l.store_id) byStore.set(l.store_id, (byStore.get(l.store_id) ?? 0) + l.quantity);
  }

  return (
    <Section title={item.name}>
      <Facts
        rows={[
          ["Colour", item.color],
          ["Size", item.size],
          ["Category", item.category_code],
          ["MRP", formatInr(item.mrp_paise)],
          ["Allocated to", storeName(item.store_id)],
          ["Status", item.status === "retired" ? "Retired (reissued)" : "Active"],
          ...(levels.data
            ? ([
                ["At the organization", `${atOrg} pcs`],
                ["In transit", `${inTransit} pcs`],
                ...[...byStore].map(([id, n]): [string, string] => [storeName(id), `${n} pcs`]),
              ] as [string, string][])
            : []),
        ]}
      />
      {levels.error && !levels.data && (
        <p className="mt-2 text-xs text-fg-muted">Stock levels need a connection.</p>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <p className="text-sm font-semibold text-fg">{title}</p>
      {children}
    </div>
  );
}

function Facts({ rows }: { rows: [string, string | null][] }) {
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v], i) => (
        <div key={`${k}-${i}`} className="contents">
          <dt className="text-fg-muted">{k}</dt>
          <dd className="min-w-0 break-words text-right text-fg">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { formatInr } from "@/lib/money";
import { supabase } from "@/lib/supabaseClient";
import { parseSku, skuFromScan, type ParsedSku } from "./codes";
import { ScanInput } from "./ScanInput";

/**
 * Header quick-scan, in every header (the public home page included): anyone — customer,
 * salesperson, owner, signed in or not — scans a price tag and sees what it is. Read-only.
 * Details come from the public, price-free `lookup_sku` RPC (name, colour, size, category, MRP,
 * store, pieces per store for the same product); offline, what the barcode itself encodes.
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

/** One `lookup_sku` match (see supabase/migrations/20260928192617_public_sku_lookup.sql). */
export interface SkuLookup {
  sku: string;
  name: string;
  color: string;
  size: string;
  category_code: string;
  category_name: string | null;
  mrp_paise: number;
  retired: boolean;
  organization_name: string;
  store_name: string | null;
  stores: { name: string; city: string | null; quantity: number }[];
}

function useSkuLookup(sku: string) {
  return useQuery({
    queryKey: ["inventory", "lookup-sku", sku],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("lookup_sku", { p_sku: sku });
      if (error) throw new Error(error.message);
      return (data ?? []) as SkuLookup[];
    },
    retry: false,
  });
}

/** Item details for a scanned or typed SKU (or a label's QR link). Also the /s/:sku page. */
export function SkuResult({ raw }: { raw: string }) {
  const sku = skuFromScan(raw) || raw;
  const parsed = parseSku(sku);
  const lookup = useSkuLookup(sku);

  return (
    <div className="space-y-3">
      <p className="break-all font-mono text-base font-semibold text-fg">{sku}</p>
      {lookup.isLoading ? (
        <p className="text-sm text-fg-muted">Looking it up…</p>
      ) : lookup.data?.length ? (
        lookup.data.map((m) => <ItemCard key={`${m.organization_name}-${m.sku}`} item={m} />)
      ) : (
        <>
          <p className="text-sm text-fg-muted">
            {lookup.error
              ? "Couldn't reach TallyThreads — showing what the label says."
              : parsed
                ? "No item with this barcode yet. The label says:"
                : "This isn't a TallyThreads label."}
          </p>
          {parsed && <DecodedCard parsed={parsed} />}
        </>
      )}
    </div>
  );
}

function ItemCard({ item }: { item: SkuLookup }) {
  const total = item.stores.reduce((n, s) => n + s.quantity, 0);
  return (
    <Section title={item.name} subtitle={item.store_name ?? item.organization_name}>
      <Facts
        rows={[
          ["Colour", item.color],
          ["Size", item.size],
          ["Category", item.category_name ?? item.category_code],
          ["MRP", formatInr(item.mrp_paise)],
        ]}
      />
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-fg-muted">Availability</p>
      {total === 0 ? (
        <p className="mt-1 text-sm text-fg">Not in any store right now.</p>
      ) : (
        <Facts
          rows={item.stores.map((s): [string, string] => [
            s.city ? `${s.name} · ${s.city}` : s.name,
            `${s.quantity} pcs`,
          ])}
        />
      )}
      {item.retired && (
        <p className="mt-2 text-xs text-fg-muted">This label was replaced by a newer one.</p>
      )}
    </Section>
  );
}

function DecodedCard({ parsed }: { parsed: ParsedSku }) {
  return (
    <Section title="From the barcode">
      <Facts
        rows={[
          parsed.unallocated ? ["Stock", `Unallocated · ${parsed.orgCode}`] : ["Store code", parsed.storeCode],
          ["Category", parsed.category],
          ["Colour", parsed.color],
          ["Size", parsed.size],
          ["Label no.", String(parsed.sequence)],
        ]}
      />
    </Section>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <p className="text-sm font-semibold text-fg">{title}</p>
      {subtitle && <p className="text-xs text-fg-muted">{subtitle}</p>}
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

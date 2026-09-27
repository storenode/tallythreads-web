import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import JsBarcode from "jsbarcode";
import { useReactToPrint } from "react-to-print";
import { Printer } from "lucide-react";
import type { InventoryItem } from "@/db";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeading } from "@/components/ui/PageHeading";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { useMember } from "@/features/auth/useMember";
import { hasPermission, useEntitlements } from "@/features/auth/entitlements";
import { useStoresByOrg } from "@/features/stores/stores";
import { markLabelsPrinted, useOrgItems } from "../distribution";
import {
  LABEL_LAYOUTS,
  countLabels,
  customA4Layout,
  labelMrp,
  labelsPerPage,
  paginateLabels,
  readLayoutPref,
  writeLayoutPref,
  type LabelData,
  type LabelLayout,
  type LabelLayoutId,
} from "../labels";

/**
 * Print barcode labels (`/org/:orgId/inventory/labels`, specs/roadmap/inventory.md §7).
 * One label per sellable unit: Code 128 of the SKU + name, colour · size and MRP (incl. of all
 * taxes). Printing goes through the browser's print dialog, so any printer works — a thermal
 * roll printer or A4 sticker sheets.
 *
 * `?items=id:qty,id:qty` preselects items and copies (reprints, dispatch reissues). Without it,
 * every finalized item that still needs labels is listed.
 */
export default function LabelsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const [params] = useSearchParams();
  const { member } = useMember();
  const { data: entitlements } = useEntitlements(member?.id);
  const canManage = hasPermission(entitlements, "inventory.manage", { organizationId: orgId });
  const items = useOrgItems(orgId);
  const { data: stores } = useStoresByOrg(orgId);

  const requested = useMemo(() => {
    const raw = params.get("items");
    if (!raw) return null;
    const m = new Map<string, number | null>();
    for (const part of raw.split(",")) {
      const [id, qty] = part.split(":");
      if (id) m.set(id, qty ? Math.max(0, Math.floor(Number(qty)) || 0) : null);
    }
    return m;
  }, [params]);

  // Candidate items + default copies.
  const candidates = useMemo(() => {
    const finalized = (items ?? []).filter((i) => i.status === "finalized" && i.sku);
    if (requested) {
      return finalized
        .filter((i) => requested.has(i.id!))
        .map((i) => ({ item: i, defaultCopies: requested.get(i.id!) ?? i.quantity }));
    }
    return finalized
      .filter((i) => i.labels_printed < i.quantity)
      .map((i) => ({ item: i, defaultCopies: i.quantity - i.labels_printed }));
  }, [items, requested]);

  const [copies, setCopies] = useState<Record<string, number>>({});
  const copiesOf = (i: InventoryItem, fallback: number) => copies[i._localId] ?? fallback;

  const pref = useMemo(() => readLayoutPref(orgId ?? ""), [orgId]);
  const [layoutId, setLayoutId] = useState<LabelLayoutId>(pref.id);
  const [cols, setCols] = useState(String(pref.cols));
  const [rows, setRows] = useState(String(pref.rows));
  const [startAt, setStartAt] = useState("1");
  const layout: LabelLayout =
    layoutId === "a4-custom"
      ? customA4Layout(Number(cols) || 1, Number(rows) || 1)
      : (LABEL_LAYOUTS.find((l) => l.id === layoutId) ?? LABEL_LAYOUTS[0]);
  useEffect(() => {
    if (orgId) writeLayoutPref(orgId, { id: layoutId, cols: Number(cols) || 4, rows: Number(rows) || 10 });
  }, [orgId, layoutId, cols, rows]);

  const entries = candidates.map(({ item, defaultCopies }) => ({
    item,
    copies: copiesOf(item, defaultCopies),
    label: {
      sku: item.sku!,
      name: item.name,
      color: item.color,
      size: item.size,
      mrpPaise: item.mrp_paise,
    } satisfies LabelData,
  }));
  const pages = paginateLabels(entries, layout, Number(startAt) || 1);
  const total = countLabels(pages);

  const printRef = useRef<HTMLDivElement>(null);
  const [printed, setPrinted] = useState(false);
  const [marked, setMarked] = useState(false);
  const print = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Labels",
    pageStyle: `@page { size: ${layout.pageW}mm ${layout.pageH}mm; margin: 0 } html, body { margin: 0; padding: 0 }`,
    onAfterPrint: () => setPrinted(true),
  });

  if (!orgId || items === undefined) return <p className="text-sm text-fg-muted">Loading…</p>;
  if (!canManage) {
    return (
      <Card>
        <p className="text-sm text-fg-muted">Only organization owners and managers print labels.</p>
      </Card>
    );
  }

  const storeName = (id: string | null) =>
    id ? (stores?.find((s) => s.id === id)?.name ?? "Store") : "Unallocated";

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <Link to={`/org/${orgId}/inventory`} className="text-sm font-medium text-fg-muted hover:text-fg">
            ← Inventory
          </Link>
        }
      >
        Print labels
      </PageHeading>

      <Card
        title="Printer"
        desc="Works with any printer through the print dialog. Thermal: set the printer's paper to the label size. A4 sheets: print at 100% scale (no “fit to page”)."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <SingleSelect
              label="Label layout"
              placeholder={null}
              value={layoutId}
              onChange={(e) => setLayoutId(e.target.value as LabelLayoutId)}
              options={[
                ...LABEL_LAYOUTS.map((l) => ({ value: l.id, label: l.name })),
                { value: "a4-custom", label: "A4 sheet · custom grid" },
              ]}
            />
          </div>
          {layoutId === "a4-custom" && (
            <>
              <Input label="Columns" type="number" inputMode="numeric" value={cols} onChange={(e) => setCols(e.target.value)} />
              <Input label="Rows" type="number" inputMode="numeric" value={rows} onChange={(e) => setRows(e.target.value)} />
            </>
          )}
          {labelsPerPage(layout) > 1 && (
            <Input
              label={`Start at label (1–${labelsPerPage(layout)})`}
              type="number"
              inputMode="numeric"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          )}
        </div>
        <p className="mt-3 text-xs text-fg-muted">
          Label {layout.labelW} × {layout.labelH} mm · {labelsPerPage(layout)} per page · {pages.length} page
          {pages.length === 1 ? "" : "s"}
        </p>
      </Card>

      <Card title="Items" desc="One label per piece. Change the copies to reprint a few.">
        {candidates.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Nothing to print. Finalize catalogued items to get SKUs; their labels show up here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map(({ item, copies: n }) => (
              <li key={item._localId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-60">
                  <p className="truncate font-mono text-sm text-fg">{item.sku}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {item.name} · {item.color} · {item.size} · {labelMrp(item.mrp_paise)} ·{" "}
                    {storeName(item.store_id)}
                    {item.labels_printed > 0 ? ` · ${item.labels_printed} printed` : ""}
                  </p>
                </div>
                <div className="w-28">
                  <Input
                    label="Copies"
                    type="number"
                    inputMode="numeric"
                    value={String(n)}
                    onChange={(e) =>
                      setCopies((c) => ({
                        ...c,
                        [item._localId]: Math.max(0, Math.floor(Number(e.target.value)) || 0),
                      }))
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {total > 0 && (
        <Card title="Preview" desc="Actual size on a phone may be scaled.">
          <div className="flex flex-wrap gap-3">
            {entries
              .filter((e) => e.copies > 0)
              .slice(0, 6)
              .map((e) => (
                <div
                  key={e.item._localId}
                  className="overflow-hidden rounded border border-dashed border-border bg-white"
                  style={{ width: `${layout.labelW}mm`, height: `${layout.labelH}mm`, maxWidth: "100%" }}
                >
                  <Label data={e.label} w={layout.labelW} h={layout.labelH} />
                </div>
              ))}
          </div>
        </Card>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={total === 0}
            onClick={() => {
              setPrinted(false);
              setMarked(false);
              print();
            }}
          >
            <Printer size={18} /> Print {total} label{total === 1 ? "" : "s"}
          </Button>
          {printed && !marked && (
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                await markLabelsPrinted(entries.map((e) => ({ item: e.item, labels: e.copies })));
                setMarked(true);
              }}
            >
              They printed — mark done
            </Button>
          )}
          {marked && <span className="text-sm text-success-text">Marked as printed.</span>}
        </div>
      </div>

      {/* Print-only content: absolutely positioned mm grid, one block per page. */}
      <div className="hidden">
        <div ref={printRef}>
          {pages.map((page, pi) => (
            <div
              key={pi}
              style={{
                position: "relative",
                width: `${layout.pageW}mm`,
                height: `${layout.pageH}mm`,
                overflow: "hidden",
                breakAfter: pi === pages.length - 1 ? "auto" : "page",
                pageBreakAfter: pi === pages.length - 1 ? "auto" : "always",
              }}
            >
              {page.map((cell, ci) => {
                if (!cell) return null;
                const col = ci % layout.cols;
                const row = Math.floor(ci / layout.cols);
                return (
                  <div
                    key={ci}
                    style={{
                      position: "absolute",
                      left: `${layout.marginLeft + col * (layout.labelW + layout.gapX)}mm`,
                      top: `${layout.marginTop + row * (layout.labelH + layout.gapY)}mm`,
                      width: `${layout.labelW}mm`,
                      height: `${layout.labelH}mm`,
                      overflow: "hidden",
                    }}
                  >
                    <Label data={cell} w={layout.labelW} h={layout.labelH} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** One label, sized in mm, inline-styled so it prints the same in the print iframe. */
function Label({ data, w, h }: { data: LabelData; w: number; h: number }) {
  const pt = Math.min(Math.max(h * 0.27, 5), 9); // base font in pt, scaled to the label height
  const pad = Math.min(1.5, h * 0.06);
  return (
    <div
      style={{
        boxSizing: "border-box",
        width: `${w}mm`,
        height: `${h}mm`,
        padding: `${pad}mm ${pad * 1.4}mm`,
        display: "flex",
        flexDirection: "column",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#000",
        lineHeight: 1.1,
      }}
    >
      <div style={{ fontSize: `${pt}pt`, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {data.name}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1mm", fontSize: `${pt * 0.9}pt` }}>
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {data.color} · {data.size}
        </span>
        <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>MRP {labelMrp(data.mrpPaise)}</span>
      </div>
      <Barcode value={data.sku} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: `${pt * 0.72}pt` }}>
        <span style={{ fontFamily: "monospace", whiteSpace: "nowrap" }}>{data.sku}</span>
        <span style={{ whiteSpace: "nowrap" }}>incl. of all taxes</span>
      </div>
    </div>
  );
}

function Barcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, { format: "CODE128", displayValue: false, margin: 0, height: 40, width: 2 });
    } catch {
      /* invalid value — leave blank */
    }
  }, [value]);
  return (
    <svg
      ref={ref}
      preserveAspectRatio="none"
      style={{ display: "block", width: "100%", flex: "1 1 0", minHeight: 0, margin: "0.4mm 0" }}
    />
  );
}

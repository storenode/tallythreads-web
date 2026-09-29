import { type ReactNode, type Ref, useEffect, useMemo, useRef, useState } from "react";
import qrcode from "qrcode-generator";
import { useReactToPrint } from "react-to-print";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { InventoryItem } from "@/db";
import { skuLookupUrl } from "./codes";
import { markLabelsPrinted } from "./distribution";
import { locationQrValue } from "./putAway";
import {
  labelMrp,
  layoutFromPref,
  paginateLabels,
  type LabelData,
  type LabelLayout,
  type LabelPage,
} from "./labels";

/**
 * Label rendering + direct printing for the Catalogue (per row, per line, selection, and new
 * labels after a UNA reissue on dispatch)
 * (specs/roadmap/inventory.md §7). Inline mm styles so it prints the same in the print iframe.
 */

/** Print-only content: absolutely positioned mm grid, one block per page. Keep it `hidden`. */
export function LabelSheet({
  pages,
  layout,
  sheetRef,
}: {
  pages: LabelPage[];
  layout: LabelLayout;
  sheetRef: Ref<HTMLDivElement>;
}) {
  return (
    <div className="hidden">
      <div ref={sheetRef}>
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
  );
}

/**
 * One label, sized in mm, inline-styled so it prints the same in the print iframe. A QR code on
 * the left, text on the right. The QR holds the public lookup link (…/s/{SKU}): any phone camera
 * opens the item's details, and the in-app scanner reads it too. It replaced a Code 128 barcode,
 * which for a full SKU (~310 bars) on a 50 mm label is ~0.14 mm a bar — too dense to print at
 * 203/300 dpi or to scan.
 */
export function Label({ data, w, h }: { data: LabelData; w: number; h: number }) {
  const pt = Math.min(Math.max(h * 0.27, 5), 9); // base font in pt, scaled to the label height
  const pad = Math.min(1.5, h * 0.06);
  const qr = Math.min(h - 2 * pad, w * 0.45); // square, as tall as the label allows
  return (
    <div
      style={{
        boxSizing: "border-box",
        width: `${w}mm`,
        height: `${h}mm`,
        padding: `${pad}mm ${pad * 1.4}mm`,
        display: "flex",
        alignItems: "center",
        gap: `${pad}mm`,
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#000",
        lineHeight: 1.15,
      }}
    >
      <QrCode value={skuLookupUrl(data.sku, window.location.origin)} sizeMm={qr} />
      <div style={{ minWidth: 0, flex: "1 1 0", display: "flex", flexDirection: "column", gap: "0.4mm" }}>
        <div style={{ fontSize: `${pt}pt`, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {data.name}
        </div>
        <div style={{ fontSize: `${pt * 0.9}pt`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {data.color} · {data.size}
        </div>
        <div style={{ fontSize: `${pt * 1.05}pt`, fontWeight: 700, whiteSpace: "nowrap" }}>
          MRP {labelMrp(data.mrpPaise)}
        </div>
        <div style={{ fontSize: `${pt * 0.62}pt`, fontFamily: "monospace", overflowWrap: "anywhere" }}>{data.sku}</div>
        <div style={{ fontSize: `${pt * 0.62}pt`, whiteSpace: "nowrap" }}>incl. of all taxes</div>
      </div>
    </div>
  );
}

/** QR code as crisp SVG squares (with its 4-module quiet zone), `sizeMm` square. */
export function QrCode({ value, sizeMm }: { value: string; sizeMm: number }) {
  const { n, path } = useMemo(() => {
    const code = qrcode(0, "M");
    code.addData(value);
    code.make();
    const count = code.getModuleCount();
    let d = "";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) if (code.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    }
    return { n: count + 8, path: d };
  }, [value]);
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      shapeRendering="crispEdges"
      style={{ display: "block", flex: "none", width: `${sizeMm}mm`, height: `${sizeMm}mm` }}
    >
      <rect width={n} height={n} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

export type PrintEntry = { item: InventoryItem; copies: number };

/**
 * Print labels straight to the browser's print dialog (no Labels screen), with the org's
 * last-used layout. The browser can't tell a real print from a cancelled dialog, so the owner
 * confirms before labels_printed goes up. Disabled when there's nothing to print.
 */
export function PrintLabelsButton({
  orgId,
  entries,
  prepare,
  disabled,
  className,
  title,
  children,
}: {
  orgId: string;
  /** What to print right away (items that already have SKUs). */
  entries: PrintEntry[];
  /**
   * Optional step before printing that returns the final entries — the Catalogue uses it to
   * create SKUs for draft items on first use. Errors are shown next to the button.
   */
  prepare?: () => Promise<PrintEntry[]>;
  disabled?: boolean;
  className: string;
  title?: string;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<"idle" | "preparing" | "printing" | "confirm">("idle");
  const [error, setError] = useState<string | null>(null);
  // Freeze what was sent to the printer: the counts shift once "Mark done" updates items.
  const [printed, setPrinted] = useState<PrintEntry[]>([]);
  const sheetRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => layoutFromPref(orgId), [orgId]);
  const print = useReactToPrint({
    contentRef: sheetRef,
    documentTitle: "Labels",
    pageStyle: `@page { size: ${layout.pageW}mm ${layout.pageH}mm; margin: 0 } html, body { margin: 0; padding: 0 }`,
    onAfterPrint: () => setPhase("confirm"),
  });
  // Only render the (barcode-heavy) sheet while printing; print once it has mounted.
  useEffect(() => {
    if (phase === "printing") print();
  }, [phase, print]);

  const pieces = printed.reduce((n, e) => n + e.copies, 0);
  const itemCount = new Set(printed.map((e) => e.item._localId)).size;

  return (
    <>
      <button
        type="button"
        className={className}
        title={title}
        disabled={disabled || (!prepare && entries.length === 0) || phase !== "idle"}
        onClick={async () => {
          setError(null);
          let next = entries;
          if (prepare) {
            setPhase("preparing");
            try {
              next = await prepare();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setPhase("idle");
              return;
            }
          }
          if (!next.length) {
            setPhase("idle");
            return;
          }
          setPrinted(next);
          setPhase("printing");
        }}
      >
        {phase === "preparing" ? "Creating SKUs…" : phase === "printing" ? "Printing…" : children}
      </button>
      {error && <span className="basis-full text-xs text-error-text">{error}</span>}
      {/* The browser can't tell a real print from a cancelled dialog, so ask — and don't let
          it be skipped: "Yes" locks the items (the stickers go on the packets). */}
      <Modal
        open={phase === "confirm"}
        onClose={() => undefined}
        dismissible={false}
        title="Did the labels print?"
      >
        <p className="text-sm text-fg">
          {pieces} label{pieces === 1 ? "" : "s"} for {itemCount} item{itemCount === 1 ? "" : "s"}.
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          Once you confirm, {itemCount === 1 ? "this item is" : "these items are"} <b>locked</b> — the
          stickers go on the packets, so the record must match them. To fix a mistake later, use
          &ldquo;Unlock to correct&rdquo; (with a reason) and print new labels.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setPhase("idle")}>
            No, nothing printed
          </Button>
          <Button
            type="button"
            onClick={async () => {
              await markLabelsPrinted(printed.map((e) => ({ item: e.item, labels: e.copies })));
              setPhase("idle");
            }}
          >
            <Lock size={16} /> Yes, printed — lock
          </Button>
        </div>
      </Modal>
      {phase === "printing" && (
        <LabelSheet
          sheetRef={sheetRef}
          layout={layout}
          pages={paginateLabels(
            printed.map((e) => ({
              copies: e.copies,
              label: {
                sku: e.item.sku!,
                name: e.item.name,
                color: e.item.color,
                size: e.item.size,
                mrpPaise: e.item.mrp_paise,
              },
            })),
            layout,
          )}
        />
      )}
    </>
  );
}

// ── rack / shelf labels (put-away) ────────────────────────────────────────────────────────

export type LocationLabelData = { id: string; code: string; place: string };

/** A rack / shelf label: QR (TTLOC:<id>, read by the in-app scanner) + the location's name. */
function LocationLabel({ data, w, h }: { data: LocationLabelData; w: number; h: number }) {
  const pt = Math.min(Math.max(h * 0.3, 6), 12);
  const pad = Math.min(1.5, h * 0.06);
  const qr = Math.min(h - 2 * pad, w * 0.45);
  return (
    <div
      style={{
        boxSizing: "border-box",
        width: `${w}mm`,
        height: `${h}mm`,
        padding: `${pad}mm ${pad * 1.4}mm`,
        display: "flex",
        alignItems: "center",
        gap: `${pad}mm`,
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#000",
        lineHeight: 1.15,
      }}
    >
      <QrCode value={locationQrValue(data.id)} sizeMm={qr} />
      <div style={{ minWidth: 0, flex: "1 1 0", display: "flex", flexDirection: "column", gap: "0.6mm" }}>
        <div style={{ fontSize: `${pt * 0.55}pt`, letterSpacing: "0.08em" }}>PLACE</div>
        <div style={{ fontSize: `${pt}pt`, fontWeight: 700, overflowWrap: "anywhere" }}>{data.code}</div>
        <div style={{ fontSize: `${pt * 0.6}pt`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {data.place}
        </div>
      </div>
    </div>
  );
}

/**
 * Print rack / shelf QR labels straight to the print dialog (org's last-used layout). Staff stick
 * them on the racks; during put-away, scanning one picks that place as the destination.
 */
export function LocationLabelsButton({
  orgId,
  labels,
  className,
  children,
}: {
  orgId: string;
  labels: LocationLabelData[];
  className: string;
  children: ReactNode;
}) {
  const [printing, setPrinting] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => layoutFromPref(orgId), [orgId]);
  const print = useReactToPrint({
    contentRef: sheetRef,
    documentTitle: "Place labels",
    pageStyle: `@page { size: ${layout.pageW}mm ${layout.pageH}mm; margin: 0 } html, body { margin: 0; padding: 0 }`,
    onAfterPrint: () => setPrinting(false),
  });
  useEffect(() => {
    if (printing) print();
  }, [printing, print]);

  const perPage = layout.cols * layout.rows;
  const pages: LocationLabelData[][] = [];
  for (let i = 0; i < labels.length; i += perPage) pages.push(labels.slice(i, i + perPage));

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={!labels.length || printing}
        onClick={() => setPrinting(true)}
      >
        {printing ? "Printing…" : children}
      </button>
      {printing && (
        <div className="hidden">
          <div ref={sheetRef}>
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
                {page.map((cell, ci) => (
                  <div
                    key={cell.id}
                    style={{
                      position: "absolute",
                      left: `${layout.marginLeft + (ci % layout.cols) * (layout.labelW + layout.gapX)}mm`,
                      top: `${layout.marginTop + Math.floor(ci / layout.cols) * (layout.labelH + layout.gapY)}mm`,
                      width: `${layout.labelW}mm`,
                      height: `${layout.labelH}mm`,
                      overflow: "hidden",
                    }}
                  >
                    <LocationLabel data={cell} w={layout.labelW} h={layout.labelH} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

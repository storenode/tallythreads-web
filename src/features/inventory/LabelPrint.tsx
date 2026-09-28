import { type ReactNode, type Ref, useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { useReactToPrint } from "react-to-print";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { InventoryItem } from "@/db";
import { markLabelsPrinted } from "./distribution";
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

/** One label, sized in mm, inline-styled so it prints the same in the print iframe. */
export function Label({ data, w, h }: { data: LabelData; w: number; h: number }) {
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

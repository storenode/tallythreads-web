import { type Ref, useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import {
  labelMrp,
  type LabelData,
  type LabelLayout,
  type LabelPage,
} from "./labels";

/**
 * Label rendering shared by the Labels page and the Catalogue table's per-row Print
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

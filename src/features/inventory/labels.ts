/**
 * Barcode label layouts (specs/roadmap/inventory.md §7). Printing goes through the browser's
 * print dialog, so any printer works: a thermal roll printer (one label per page, the page sized
 * to the label) or an ordinary A4 printer on sticker sheets (a grid per page, with "start at
 * label N" to reuse a partly used sheet). Dimensions in millimetres. Labels narrower than ~50 mm
 * are avoided: a full SKU in Code 128 gets too dense for 203-dpi thermal heads to print scannably.
 */

export type LabelLayoutId = "thermal-50x25" | "thermal-60x40" | "a4-65" | "a4-24" | "a4-custom";

export interface LabelLayout {
  id: LabelLayoutId;
  name: string;
  /** Page size for @page. */
  pageW: number;
  pageH: number;
  cols: number;
  rows: number;
  labelW: number;
  labelH: number;
  /** Page margins (top/left) and gaps between labels. */
  marginTop: number;
  marginLeft: number;
  gapX: number;
  gapY: number;
}

export const LABEL_LAYOUTS: LabelLayout[] = [
  {
    id: "thermal-50x25",
    name: "Thermal roll · 50 × 25 mm",
    pageW: 50, pageH: 25, cols: 1, rows: 1, labelW: 50, labelH: 25,
    marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0,
  },
  {
    id: "thermal-60x40",
    name: "Thermal roll · 60 × 40 mm",
    pageW: 60, pageH: 40, cols: 1, rows: 1, labelW: 60, labelH: 40,
    marginTop: 0, marginLeft: 0, gapX: 0, gapY: 0,
  },
  {
    id: "a4-65",
    name: "A4 sheet · 65 labels (38.1 × 21.2 mm)",
    pageW: 210, pageH: 297, cols: 5, rows: 13, labelW: 38.1, labelH: 21.2,
    marginTop: 10.7, marginLeft: 4.65, gapX: 2.5, gapY: 0,
  },
  {
    id: "a4-24",
    name: "A4 sheet · 24 labels (64 × 34 mm)",
    pageW: 210, pageH: 297, cols: 3, rows: 8, labelW: 64, labelH: 34,
    marginTop: 12.5, marginLeft: 7, gapX: 2, gapY: 0,
  },
];

export const labelsPerPage = (l: LabelLayout) => l.cols * l.rows;

/** A custom A4 grid: the label size is derived from the grid so it always fits the sheet. */
export function customA4Layout(cols: number, rows: number, marginMm = 8, gapMm = 2): LabelLayout {
  const c = Math.min(Math.max(Math.round(cols), 1), 8);
  const r = Math.min(Math.max(Math.round(rows), 1), 20);
  const labelW = (210 - 2 * marginMm - (c - 1) * gapMm) / c;
  const labelH = (297 - 2 * marginMm - (r - 1) * gapMm) / r;
  return {
    id: "a4-custom",
    name: `A4 sheet · custom ${c} × ${r}`,
    pageW: 210, pageH: 297, cols: c, rows: r,
    labelW: Math.floor(labelW * 10) / 10,
    labelH: Math.floor(labelH * 10) / 10,
    marginTop: marginMm, marginLeft: marginMm, gapX: gapMm, gapY: gapMm,
  };
}

export interface LabelData {
  sku: string;
  name: string;
  color: string;
  size: string;
  mrpPaise: number;
}

/** One printed page: `null` cells are skipped stickers (start-at-N on a used sheet). */
export type LabelPage = (LabelData | null)[];

/**
 * Expand items × copies into pages for a layout. `startAt` (1-based) leaves the first
 * `startAt - 1` positions of the FIRST page empty — only meaningful for sheet layouts.
 */
export function paginateLabels(
  entries: { label: LabelData; copies: number }[],
  layout: LabelLayout,
  startAt = 1,
): LabelPage[] {
  const perPage = labelsPerPage(layout);
  const skip = perPage > 1 ? Math.min(Math.max(Math.floor(startAt) - 1, 0), perPage - 1) : 0;
  const cells: (LabelData | null)[] = Array(skip).fill(null);
  for (const e of entries) for (let i = 0; i < Math.max(0, e.copies); i++) cells.push(e.label);
  if (cells.length === skip) return [];
  const pages: LabelPage[] = [];
  for (let i = 0; i < cells.length; i += perPage) pages.push(cells.slice(i, i + perPage));
  return pages;
}

/** Total physical labels (skipped cells excluded). */
export const countLabels = (pages: LabelPage[]) =>
  pages.reduce((n, p) => n + p.filter(Boolean).length, 0);

/** "₹1,299" — whole rupees when exact (MRPs are), else two decimals. */
export function labelMrp(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

const LAYOUT_KEY = (orgId: string) => `tt:label-layout:${orgId}`;

/** The org's default layout on this device (per-viewer convenience; falls back to thermal). */
export function readLayoutPref(orgId: string): { id: LabelLayoutId; cols: number; rows: number } {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY(orgId));
    if (raw) {
      const v = JSON.parse(raw) as { id: LabelLayoutId; cols: number; rows: number };
      if (v && typeof v.id === "string") return v;
    }
  } catch {
    /* storage unavailable */
  }
  return { id: "thermal-50x25", cols: 4, rows: 10 };
}

export function writeLayoutPref(orgId: string, v: { id: LabelLayoutId; cols: number; rows: number }) {
  try {
    localStorage.setItem(LAYOUT_KEY(orgId), JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

/** The org's last-used label layout (chosen on the Labels page), for one-click printing. */
export function layoutFromPref(orgId: string): LabelLayout {
  const pref = readLayoutPref(orgId);
  if (pref.id === "a4-custom") return customA4Layout(pref.cols || 1, pref.rows || 1);
  return LABEL_LAYOUTS.find((l) => l.id === pref.id) ?? LABEL_LAYOUTS[0];
}

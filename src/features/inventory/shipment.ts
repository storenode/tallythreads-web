import { formatInr } from "@/lib/money";

/**
 * How a dispatch travels (Phase 2G, specs/roadmap/inventory.md §11): one dispatch
 * (`stock_transfers` row) = one shipment. Pure helpers shared by the Catalogue dispatch form,
 * the per-invoice Dispatches list and the store Receive page. The server re-validates the same
 * rules in `apply_transfer_shipment`.
 */

export type TransportMode = "courier" | "bus" | "lorry" | "hand" | "other";
export type FreightPayer = "org" | "store";

export interface Shipment {
  transport_mode: TransportMode | null;
  carrier_name: string | null;
  tracking_no: string | null;
  vehicle_no: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  packages: number | null;
  /** YYYY-MM-DD */
  expected_at: string | null;
  freight_paise: number | null;
  freight_paid_by: FreightPayer | null;
  receipt_path: string | null;
}

export interface TransportModeInfo {
  value: TransportMode;
  label: string;
  /** Label for `carrier_name`, or null when the mode has no carrier. */
  carrierLabel: string | null;
  carrierPlaceholder: string;
  /** Label for `tracking_no`, or null when the mode has none. */
  trackingLabel: string | null;
  /** Short prefix used in summaries ("AWB 7845…", "LR 4471"). */
  trackingShort: string;
  trackingRequired: boolean;
  showVehicle: boolean;
}

export const TRANSPORT_MODES: TransportModeInfo[] = [
  {
    value: "courier",
    label: "Courier",
    carrierLabel: "Courier company",
    carrierPlaceholder: "DTDC, Professional, ST Courier…",
    trackingLabel: "AWB / docket no.",
    trackingShort: "AWB",
    trackingRequired: true,
    showVehicle: false,
  },
  {
    value: "bus",
    label: "Bus / travels parcel",
    carrierLabel: "Travels / operator",
    carrierPlaceholder: "KPN, SRS, Orange Travels…",
    trackingLabel: "LR / booking no.",
    trackingShort: "LR",
    trackingRequired: true,
    showVehicle: true,
  },
  {
    value: "lorry",
    label: "Lorry / transport",
    carrierLabel: "Transporter",
    carrierPlaceholder: "VRL, local transport…",
    trackingLabel: "LR no.",
    trackingShort: "LR",
    trackingRequired: true,
    showVehicle: true,
  },
  {
    value: "hand",
    label: "Hand delivery",
    carrierLabel: null,
    carrierPlaceholder: "",
    trackingLabel: null,
    trackingShort: "",
    trackingRequired: false,
    showVehicle: true,
  },
  {
    value: "other",
    label: "Other",
    carrierLabel: "Sent via",
    carrierPlaceholder: "e.g. a friend's car",
    trackingLabel: "Reference no.",
    trackingShort: "Ref",
    trackingRequired: false,
    showVehicle: true,
  },
];

export const modeInfo = (mode: TransportMode | null | undefined) =>
  TRANSPORT_MODES.find((m) => m.value === mode);

export const emptyShipment = (): Shipment => ({
  transport_mode: null,
  carrier_name: null,
  tracking_no: null,
  vehicle_no: null,
  contact_name: null,
  contact_phone: null,
  packages: null,
  expected_at: null,
  freight_paise: null,
  freight_paid_by: null,
  receipt_path: null,
});

/** Problems that would stop the server accepting the shipment (same rules, friendlier wording). */
export function validateShipment(s: Shipment): string[] {
  const out: string[] = [];
  const info = modeInfo(s.transport_mode);
  if (!info) {
    out.push("Choose how the stock travels");
    return out;
  }
  if (info.trackingRequired && !s.tracking_no?.trim()) out.push(`Add the ${info.trackingLabel}`);
  if (s.packages != null && (!Number.isInteger(s.packages) || s.packages <= 0)) {
    out.push("Boxes must be a whole number above 0");
  }
  if (s.freight_paise != null && s.freight_paise < 0) out.push("Freight can't be negative");
  if (s.freight_paise != null && !s.freight_paid_by) {
    out.push("Say who pays the freight — the organization or the store");
  }
  if (s.expected_at != null && !/^\d{4}-\d{2}-\d{2}$/.test(s.expected_at)) {
    out.push("Expected arrival must be a date");
  }
  return out;
}

/**
 * The RPC payload. Fields the chosen mode doesn't use are dropped, so switching from Courier to
 * Hand delivery doesn't keep a stale AWB number.
 */
export function toShipmentPayload(s: Shipment): Record<string, string | number | null> {
  const info = modeInfo(s.transport_mode);
  const t = (v: string | null) => (v?.trim() ? v.trim() : null);
  return {
    transport_mode: s.transport_mode,
    carrier_name: info?.carrierLabel ? t(s.carrier_name) : null,
    tracking_no: info?.trackingLabel ? t(s.tracking_no) : null,
    vehicle_no: info?.showVehicle ? t(s.vehicle_no)?.toUpperCase() ?? null : null,
    contact_name: t(s.contact_name),
    contact_phone: t(s.contact_phone),
    packages: s.packages,
    expected_at: s.expected_at,
    freight_paise: s.freight_paise,
    // A payer without an amount is allowed: "store pays on delivery", amount unknown yet.
    freight_paid_by: s.freight_paid_by,
    receipt_path: s.receipt_path,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "30 Sep" from "2026-09-30" — fixed month names (ICU's en-IN says "Sept" on some devices). */
export function shortDate(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1] ?? ""}`.trim();
}

/**
 * One line for lists and the store's Receive page:
 * "DTDC · AWB 7845 · 2 boxes · expected 30 Sep · To pay ₹350".
 * Freight is org cost: the store only sees it when the store pays (to-pay on delivery).
 */
export function shipmentSummary(s: Partial<Shipment> | null | undefined, viewer: "org" | "store"): string {
  if (!s?.transport_mode) return "";
  const info = modeInfo(s.transport_mode);
  const parts: string[] = [];
  parts.push(s.carrier_name?.trim() || info?.label || "");
  if (s.tracking_no?.trim()) parts.push(`${info?.trackingShort || "Ref"} ${s.tracking_no.trim()}`);
  if (s.vehicle_no?.trim()) parts.push(s.vehicle_no.trim());
  if (s.transport_mode === "hand" && s.contact_name?.trim()) parts.push(`by ${s.contact_name.trim()}`);
  if (s.packages) parts.push(`${s.packages} box${s.packages === 1 ? "" : "es"}`);
  if (s.expected_at) parts.push(`expected ${shortDate(s.expected_at)}`);
  if (s.freight_paise != null) {
    if (s.freight_paid_by === "store") parts.push(`To pay ${formatInr(s.freight_paise)}`);
    else if (viewer === "org") parts.push(`Freight ${formatInr(s.freight_paise)} paid`);
  }
  return parts.filter(Boolean).join(" · ");
}

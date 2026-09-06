// Small money helpers for the UI. All amounts are stored as integer paise; these only
// format for display and parse rupee text back to paise. No business math here — that
// lives in the tested engines (gstCalc, landedCost, purchaseMargin, tripForecast).

/** Format integer paise as an Indian-locale rupee string, e.g. 123456 → "₹1,234.56". */
export function formatInr(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const rupees = Math.abs(paise) / 100;
  return (
    sign +
    "₹" +
    rupees.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Paise → a plain rupee string for a form field default, e.g. 123456 → "1234.56". */
export function paiseToRupeeInput(paise: number | null | undefined): string {
  if (paise == null) return "";
  return (paise / 100).toString();
}

/**
 * Parse a rupee text field to integer paise. Returns null for empty/invalid/negative
 * input so callers can store a nullable column or surface a validation error.
 */
export function rupeesToPaise(input: string): number | null {
  const t = input.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** Format a fraction as a percent string, e.g. 0.6 → "60%". */
export function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/**
 * Short codes used in SKUs (specs/roadmap/inventory.md §5):
 *   {store_code}-{CAT}-{COLOR}-{SIZE}-{SEQ}      BND-KDP-SAR-RED-FREE-0042
 *   {org_code}-UNA-{CAT}-{COLOR}-{SIZE}-{SEQ}    BND-UNA-SAR-RED-FREE-0007
 *
 * The database is the authority for category codes (the inventory_categories_assign_code
 * trigger keeps one name ↔ one code across an org). These helpers mirror its rules so the UI
 * can show and suggest the same codes before a sync round-trip.
 */

/** Org short code / category code: 2–6 of A–Z, 0–9. */
export const CODE_RE = /^[A-Z0-9]{2,6}$/;

/** Store code: 2–12 of A–Z, 0–9, "-" (e.g. BND-KDP). Required for SKUs. */
export const STORE_CODE_RE = /^[A-Z0-9][A-Z0-9-]{0,10}[A-Z0-9]$/;

/** Uppercase and strip everything but A–Z/0–9 (what a code field accepts as you type). */
export function normalizeCode(input: string, maxLength = 6): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, maxLength);
}

/** Uppercase a store code, keeping single hyphens between segments. */
export function normalizeStoreCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .slice(0, 12);
}

/**
 * Suggested org short code: the prefix every store code already shares (BND-KDP, BND-NLR →
 * BND), else the name's initials (Vasavi Cloth Store → VCS), else its first letters.
 * Mirrors the backfill in 20260927191604_inventory_phase2a_codes.sql.
 */
export function suggestOrgCode(name: string, storeCodes: (string | null)[] = []): string {
  const prefixes = new Set(
    storeCodes
      .map((c) => (c ?? "").trim().toUpperCase().split("-")[0])
      .filter(Boolean),
  );
  if (prefixes.size === 1) {
    const [p] = prefixes;
    if (CODE_RE.test(p)) return p;
  }
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const code =
    words.length >= 2
      ? words.map((w) => w[0]).join("").slice(0, 6)
      : normalizeCode(name);
  return CODE_RE.test(code) ? code : "";
}

const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The code an org uses for a category name, given the org's existing categories: the existing
 * code for that name if any store has it, else the first 3 letters/digits of the name,
 * suffixed 2, 3, … if a different name already uses it. Mirrors
 * `inventory_category_code_for()`.
 */
export function categoryCodeFor(
  name: string,
  orgCategories: readonly { name: string; code?: string | null }[],
): string {
  const existing = orgCategories.find((c) => c.code && sameName(c.name, name));
  if (existing?.code) return existing.code;

  let base = normalizeCode(name, 3);
  if (base.length < 2) base = base.padEnd(2, "X");
  const takenByOthers = new Set(
    orgCategories
      .filter((c) => c.code && !sameName(c.name, name))
      .map((c) => c.code as string),
  );
  let candidate = base;
  for (let n = 2; takenByOthers.has(candidate); n++) candidate = `${base}${n}`;
  return candidate;
}

/** What a SKU / barcode says on its own, read back from the format above. */
export interface ParsedSku {
  sku: string;
  /** Store code for a store's SKU (BND-KDP), or `{org_code}-UNA` for unallocated stock. */
  prefix: string;
  /** Unallocated (`{org_code}-UNA-…`): catalogued at the organization, not yet a store's. */
  unallocated: boolean;
  /** Org short code — only knowable from an unallocated SKU. */
  orgCode: string | null;
  /** Store code — null for unallocated stock. */
  storeCode: string | null;
  category: string;
  /** Colour and size as SKU segments (uppercased, A–Z/0–9, max 6 — see sku_segment()). */
  color: string;
  size: string;
  sequence: number;
}

const SEGMENT_RE = /^[A-Z0-9]{1,6}$/;

/**
 * Split a scanned SKU into its parts, from the right: the store code may itself contain
 * hyphens (BND-KDP), the four segments after it never do. Null when it isn't a TallyThreads SKU.
 */
export function parseSku(raw: string): ParsedSku | null {
  const sku = raw.trim().toUpperCase().replace(/\s+/g, "");
  const parts = sku.split("-");
  if (parts.length < 5) return null;
  const [category, color, size, seq] = parts.slice(-4);
  const prefix = parts.slice(0, -4).join("-");
  if (!CODE_RE.test(category) || !SEGMENT_RE.test(color) || !SEGMENT_RE.test(size)) return null;
  if (!/^\d{4,}$/.test(seq) || !STORE_CODE_RE.test(prefix)) return null;
  const unallocated = prefix.endsWith("-UNA");
  return {
    sku,
    prefix,
    unallocated,
    orgCode: unallocated ? prefix.slice(0, -4) : null,
    storeCode: unallocated ? null : prefix,
    category,
    color,
    size,
    sequence: Number(seq),
  };
}

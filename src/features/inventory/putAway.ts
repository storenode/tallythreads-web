/**
 * Put-away at the store (specs/roadmap/inventory.md §8, stock-placement.md): after a dispatch is
 * received (usually into the stock room), staff scan a packet, the app suggests where it belongs
 * on the display, and they move it — or scan the rack's own QR label to pick the destination.
 * Pure helpers; the screens live in features/operations/pages/InventoryPage.tsx.
 *
 * The item label's QR is NOT touched: it only carries the SKU link. A location changes over an
 * item's life, a printed label doesn't — so "where it goes" is looked up live, never printed.
 */

/** What a rack / shelf QR label encodes. Plain text (not a URL): only the in-app scanner reads it. */
const LOCATION_PREFIX = "TTLOC:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const locationQrValue = (locationId: string) => `${LOCATION_PREFIX}${locationId}`;

/** The location id in a scanned rack label, or null when the scan isn't a rack label. */
export function locationFromScan(raw: string): string | null {
  const s = raw.trim();
  if (s.slice(0, LOCATION_PREFIX.length).toUpperCase() !== LOCATION_PREFIX) return null;
  const id = s.slice(LOCATION_PREFIX.length).trim();
  return UUID.test(id) ? id.toLowerCase() : null;
}

export interface PlaceCandidate {
  /** stock_locations.id */
  id: string;
  code: string;
  /** The store category this display location is tagged with (Sarees rack…), if any. */
  categoryId: string | null;
}

/**
 * Where an item belongs on the store's display: the display locations tagged with the store's
 * category for the item's category code (sorted by code). Empty when nothing is tagged — the
 * user then picks any place.
 */
export function suggestPlaces(
  itemCategoryCode: string,
  storeCategories: { id?: string; code?: string | null }[],
  displayLocations: PlaceCandidate[],
): PlaceCandidate[] {
  const categoryIds = new Set(
    storeCategories.filter((c) => c.id && c.code === itemCategoryCode).map((c) => c.id!),
  );
  if (!categoryIds.size) return [];
  return displayLocations
    .filter((l) => l.categoryId && categoryIds.has(l.categoryId))
    .sort((a, b) => a.code.localeCompare(b.code));
}

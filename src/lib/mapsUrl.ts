// Build a Google "Maps URLs" directions link for a route leg. This is Google's free,
// documented, key-less URL scheme (developers.google.com/maps/documentation/urls) — NOT
// the paid Places/Embed APIs. The owner clicks it to eyeball their entry (human typo
// detection); nothing is captured back. Pure + deterministic, so it's unit-testable and
// works to generate offline (the link only needs network when actually clicked).

import type { TripLegMode } from "@/db/purchaseTrips";

export const LEG_MODE_OPTIONS: { value: TripLegMode; label: string }[] = [
  { value: "driving", label: "Car" },
  { value: "transit", label: "Bus / Train" },
  { value: "bicycling", label: "Bike" },
  { value: "walking", label: "Walk" },
];

/**
 * Directions URL from `from` → `to` for the given mode. Returns null if either endpoint
 * is blank (nothing to verify yet). Endpoints are URL-encoded, so spaces/commas are safe.
 */
export function legMapUrl(
  from: string,
  to: string,
  mode: TripLegMode = "driving",
): string | null {
  const origin = from.trim();
  const destination = to.trim();
  if (!origin || !destination) return null;
  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: mode,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

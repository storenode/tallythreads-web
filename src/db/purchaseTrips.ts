import type { SyncMeta } from "./types";

/** Travel mode for a route leg — maps to Google "Maps URLs" travelmode values. */
export type TripLegMode = "driving" | "transit" | "bicycling" | "walking";

/**
 * One leg in the trip's planning route (`route` jsonb). Location is captured as our own
 * free text; the "Verify on map" link is generated from from/to/mode at render time
 * (see lib/mapsUrl.ts), not stored. `price_paise` is the planning-estimate travel cost
 * for this leg (integer paise).
 */
export interface TripRouteLeg {
  from: string;
  to: string;
  boarding: string;
  drop_point: string;
  /** Distance in km — required in the form, so the owner opens the map link to read it. */
  distance_km: number | null;
  mode: TripLegMode;
  /** Estimated travel price for this leg (planning). */
  price_paise: number | null;
  /** Planned shopping/purchase spend at this location — the "cart" (planning). */
  planned_purchase_paise: number | null;
}

export type PurchaseTripStatus = "planning" | "active" | "completed";

export interface PurchaseTrip extends SyncMeta {
  id?: string;
  organization_id: string;
  created_by: string;
  title: string;
  status: PurchaseTripStatus;
  // planning phase
  start_date: string | null;
  end_date: string | null;
  route: TripRouteLeg[] | null;
  planned_budget_paise: number | null;
  estimated_expenses_paise: number | null;
  expense_estimate_source: "manual" | "ai" | null;
  expected_margin_pct: number | null;
  notes: string | null;
}

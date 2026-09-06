import type { TripRouteLeg } from "@/db/purchaseTrips";

/** A fresh, empty route leg. */
export function emptyLeg(): TripRouteLeg {
  return {
    from: "",
    to: "",
    boarding: "",
    drop_point: "",
    distance_km: null,
    mode: "driving",
    price_paise: null,
    planned_purchase_paise: null,
  };
}

/** Sum of every leg's estimated travel price (paise). */
export function legsPriceTotalPaise(legs: TripRouteLeg[]): number {
  return legs.reduce((s, l) => s + (l.price_paise ?? 0), 0);
}

/** Sum of every leg's planned purchase spend — the trip "cart" total (paise). */
export function legsPurchaseTotalPaise(legs: TripRouteLeg[]): number {
  return legs.reduce((s, l) => s + (l.planned_purchase_paise ?? 0), 0);
}

/** True when a leg has the required fields: From, To, and Distance (km). */
export function isLegComplete(leg: TripRouteLeg): boolean {
  return (
    leg.from.trim() !== "" &&
    leg.to.trim() !== "" &&
    leg.distance_km != null &&
    leg.distance_km >= 0
  );
}

/** True when every leg is complete (empty list counts as valid — no legs to check). */
export function areLegsValid(legs: TripRouteLeg[]): boolean {
  return legs.every(isLegComplete);
}

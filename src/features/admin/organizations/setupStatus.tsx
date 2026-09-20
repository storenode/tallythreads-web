import type { OrganizationFullDetail } from "./organizations";

/**
 * Single source of truth for how an organization's operational setup
 * progress is labelled and colored across the app (dashboard cards, and
 * anywhere else this shows up). Stages are ordered — each one requires the
 * previous to be true — so progress only ever moves forward as data is
 * filled in. Add new stages here only, never hardcode a label/color pair at
 * a call site.
 *
 * Colors reuse the same semantic text tokens as badges (error/warning/brand/
 * success in index.css), which already swap saturation per theme: darker/
 * thicker text on a pale bg in light mode, lighter text on a dark-tinted bg
 * in dark mode.
 */
export type SetupStage = "not_started" | "stores_added" | "stock_ready" | "live";

export const SETUP_STAGE_ORDER: SetupStage[] = [
  "not_started",
  "stores_added",
  "stock_ready",
  "live",
];

export const SETUP_STAGE_META: Record<
  SetupStage,
  { label: string; textClass: string; bgClass: string; fillClass: string }
> = {
  not_started: {
    label: "Not started",
    textClass: "text-error-text",
    bgClass: "bg-error-bg",
    fillClass: "bg-error-text",
  },
  stores_added: {
    label: "Stores added",
    textClass: "text-warning-text",
    bgClass: "bg-warning-bg",
    fillClass: "bg-warning-text",
  },
  stock_ready: {
    label: "Stock configured",
    textClass: "text-brand-text-active",
    bgClass: "bg-brand-subtle-bg",
    fillClass: "bg-brand",
  },
  live: {
    label: "Live",
    textClass: "text-success-text",
    bgClass: "bg-success-bg",
    fillClass: "bg-success-text",
  },
};

/** Stores → stock setup (warehouses or stock locations) → activity (a
 * purchase trip) — each gate must clear before the next stage applies. */
export function computeSetupStage(org: OrganizationFullDetail): SetupStage {
  // Defensive `?? []`: a cache write can briefly hand us a bare Organization
  // (no nested arrays) before the full detail refetches — never crash on it.
  const stores = org.stores ?? [];
  const warehouses = org.warehouses ?? [];
  const trips = org.purchaseTrips ?? [];

  const hasStores = stores.length > 0;
  if (!hasStores) return "not_started";

  const hasStockSetup =
    warehouses.length > 0 ||
    stores.some((s) => (s.stockLocations ?? []).length > 0);
  if (!hasStockSetup) return "stores_added";

  const hasActivity = trips.length > 0;
  if (!hasActivity) return "stock_ready";

  return "live";
}

export function SetupProgressBar({ org }: { org: OrganizationFullDetail }) {
  const stage = computeSetupStage(org);
  const stepIndex = SETUP_STAGE_ORDER.indexOf(stage);
  const pct = ((stepIndex + 1) / SETUP_STAGE_ORDER.length) * 100;
  const meta = SETUP_STAGE_META[stage];

  const isComplete = stage === "live";

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-xs">
        {isComplete ? (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${meta.bgClass} ${meta.textClass}`}
          >
            {meta.label}
          </span>
        ) : (
          <span className={`font-medium ${meta.textClass}`}>{meta.label}</span>
        )}
        <span className="text-fg-muted">
          {stepIndex + 1}/{SETUP_STAGE_ORDER.length}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full transition-[width] ${meta.fillClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

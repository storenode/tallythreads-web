import { Truck } from "lucide-react";
import { useOrganizationPurchaseTrips } from "../../organizations/organizations";
import { formatInr } from "@/lib/money";

const SANS = "'Plus Jakarta Sans', 'Inter', sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

const STATUS_STYLE: Record<string, string> = {
  planning:
    "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
  active:
    "bg-tt-green-50 text-tt-green-600 dark:bg-tt-green-500/15 dark:text-tt-green-500",
  completed:
    "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
};

function dateRange(start: string | null, end: string | null): string | null {
  const s = start?.slice(0, 10);
  const e = end?.slice(0, 10);
  if (s && e) return `${s} → ${e}`;
  return s ?? e ?? null;
}

/**
 * Read-only summary of an organization's purchase trips, for the admin Demo Data
 * cards. Purchase Trips is an org-level module (see roles-and-permissions.md §5), so
 * it belongs beside the org's members. Falls back to a friendly empty message.
 */
export function PurchaseTripsSection({ orgId }: { orgId: string }) {
  const { data: trips, isLoading, isError } = useOrganizationPurchaseTrips(orgId);

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.02]">
      <h4
        className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90"
        style={{ fontFamily: SANS }}
      >
        <span className="text-tt-green-500">
          <Truck size={16} />
        </span>
        Purchase trips
      </h4>

      {isLoading ? (
        <p className="text-[13px] text-gray-400 dark:text-gray-500">
          Loading purchase trips…
        </p>
      ) : isError ? (
        <p className="text-[13px] text-red-500">Couldn't load purchase trips.</p>
      ) : (trips ?? []).length === 0 ? (
        <p className="text-[13px] text-gray-400 dark:text-gray-500">
          No purchase trips yet — this organization hasn't planned a buying trip.
        </p>
      ) : (
        <ul className="space-y-2">
          {trips!.map((trip) => {
            const range = dateRange(trip.startDate, trip.endDate);
            return (
              <li
                key={trip.id}
                className="flex items-start justify-between gap-3 rounded-md border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]"
              >
                <div className="min-w-0">
                  <p
                    className="truncate text-[13px] font-medium text-gray-800 dark:text-white/90"
                    style={{ fontFamily: SANS }}
                  >
                    {trip.title}
                  </p>
                  {range && (
                    <p
                      className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500"
                      style={{ fontFamily: MONO }}
                    >
                      {range}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${STATUS_STYLE[trip.status] ?? STATUS_STYLE.planning}`}
                    style={{ fontFamily: SANS }}
                  >
                    {trip.status}
                  </span>
                  {trip.plannedBudgetPaise != null && (
                    <span
                      className="text-[11px] text-gray-500 dark:text-gray-400"
                      style={{ fontFamily: MONO }}
                    >
                      {formatInr(trip.plannedBudgetPaise)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

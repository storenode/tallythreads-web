import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SingleSelect } from "@/components/ui/SingleSelect";
import type { TripRouteLeg, TripLegMode } from "@/db/purchaseTrips";
import { LEG_MODE_OPTIONS, legMapUrl } from "@/lib/mapsUrl";
import { paiseToRupeeInput, rupeesToPaise } from "@/lib/money";
import { emptyLeg } from "../legs";

interface Props {
  value: TripRouteLeg[];
  onChange: (legs: TripRouteLeg[]) => void;
  /** When true, show inline "Required" errors on incomplete fields (after a save attempt). */
  showErrors?: boolean;
}

/**
 * Editable multi-leg route table. Location is our own free text; each leg gets a
 * generated free Google Maps "Verify on map" link (from/to/mode) the owner clicks to
 * eyeball their entry — no API key, no data captured back.
 */
export function RouteLegsTable({ value, onChange, showErrors = false }: Props) {
  const update = (i: number, patch: Partial<TripRouteLeg>) =>
    onChange(value.map((leg, idx) => (idx === i ? { ...leg, ...patch } : leg)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, emptyLeg()]);

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-sm text-fg-muted">
          No legs yet. Add each place you'll travel to on this trip.
        </p>
      )}

      {value.map((leg, i) => {
        const mapUrl = legMapUrl(leg.from, leg.to, leg.mode);
        return (
          <div key={i} className="rounded-lg border border-border p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-fg-muted">Leg {i + 1}</span>
              <button
                type="button"
                className="text-xs text-fg-muted hover:text-red-500"
                onClick={() => remove(i)}
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="From"
                placeholder="Kadapa"
                value={leg.from}
                onChange={(e) => update(i, { from: e.target.value })}
              />
              <Input
                label="To"
                placeholder="Surat"
                value={leg.to}
                onChange={(e) => update(i, { to: e.target.value })}
              />
              <Input
                label="Boarding point"
                placeholder="RTC bus stand"
                value={leg.boarding}
                onChange={(e) => update(i, { boarding: e.target.value })}
              />
              <Input
                label="Drop point"
                placeholder="Textile market gate 2"
                value={leg.drop_point}
                onChange={(e) => update(i, { drop_point: e.target.value })}
              />
              <Input
                label="Distance (km) *"
                type="number"
                inputMode="decimal"
                placeholder="e.g. 920"
                hint="Open Verify on map to read the distance."
                error={
                  showErrors && (leg.distance_km == null || leg.distance_km < 0)
                    ? "Required"
                    : undefined
                }
                value={leg.distance_km == null ? "" : String(leg.distance_km)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  update(i, {
                    distance_km:
                      e.target.value.trim() === "" || !Number.isFinite(n) ? null : n,
                  });
                }}
              />
              <SingleSelect
                label="Mode"
                options={LEG_MODE_OPTIONS}
                value={leg.mode}
                onChange={(e) => update(i, { mode: e.target.value as TripLegMode })}
                placeholder={null}
              />
              <Input
                label="Est. travel price"
                type="number"
                inputMode="decimal"
                suffix="₹"
                value={paiseToRupeeInput(leg.price_paise)}
                onChange={(e) =>
                  update(i, { price_paise: rupeesToPaise(e.target.value) })
                }
              />
              <Input
                label="Purchase here (cart)"
                type="number"
                inputMode="decimal"
                suffix="₹"
                hint="How much you plan to buy at this place."
                value={paiseToRupeeInput(leg.planned_purchase_paise)}
                onChange={(e) =>
                  update(i, { planned_purchase_paise: rupeesToPaise(e.target.value) })
                }
              />
              <div className="flex items-end">
                {mapUrl ? (
                  <a
                    href={mapUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    Verify on map ↗
                  </a>
                ) : (
                  <span className="text-xs text-fg-muted">
                    Enter From &amp; To to verify on the map
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <Button type="button" variant="ghost" onClick={add}>
        + Add leg
      </Button>
    </div>
  );
}

import type { PlacementColor } from "@/db";
import { COLOR_META, PLACEMENT_COLORS } from "./colors";

/**
 * A small swatch-row colour picker for a location. Constrained palette + a "None" option.
 * Used in the store-edit placement form and the demo placement editor.
 */
export function ColorPicker({
  value,
  onChange,
  label = "Colour (optional)",
}: {
  value: PlacementColor | null;
  onChange: (color: PlacementColor | null) => void;
  label?: string;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm text-fg-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          title="No colour"
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] text-fg-muted ${
            value === null
              ? "border-brand ring-2 ring-brand/30"
              : "border-border"
          }`}
        >
          ✕
        </button>
        {PLACEMENT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={COLOR_META[c].label}
            aria-pressed={value === c}
            onClick={() => onChange(c)}
            className={`h-6 w-6 rounded-full ${COLOR_META[c].swatch} ${
              value === c
                ? "ring-2 ring-offset-1 ring-fg/60 ring-offset-surface"
                : ""
            }`}
          />
        ))}
      </div>
    </div>
  );
}

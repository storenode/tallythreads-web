import type { PlacementColor } from "@/db";
import { chipClasses } from "./colors";

/**
 * A location's code rendered as a colour chip. The single reusable token for a placement
 * across the app (placement tree, the demo store card, and the future inventory picker/labels).
 * Colour is an aid — the code text is always shown, so it works for colourblind staff and B/W
 * labels. See specs / the stock-location colors design.
 */
export function LocationChip({
  code,
  color,
  className = "",
}: {
  code: string;
  color: PlacementColor | null;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${chipClasses(
        color,
      )} ${className}`}
    >
      {code}
    </span>
  );
}

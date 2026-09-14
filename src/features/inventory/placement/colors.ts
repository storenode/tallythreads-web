import type { PlacementColor } from "@/db";

/** The palette shown in the picker, in order. A constrained set (theme-aware, maps to buyable
 * colored shelf labels) — see the stock-location colors design. */
export const PLACEMENT_COLORS: PlacementColor[] = [
  "red",
  "amber",
  "green",
  "teal",
  "blue",
  "violet",
  "pink",
  "slate",
];

interface ColorMeta {
  label: string;
  /** Chip classes: a light colour tint + readable text in light AND dark mode. */
  chip: string;
  /** Solid swatch (the picker dot). */
  swatch: string;
}

// Full literal class strings so Tailwind's JIT keeps them (never build these by concatenation).
export const COLOR_META: Record<PlacementColor, ColorMeta> = {
  red: {
    label: "Red",
    chip: "bg-red-500/15 text-red-700 dark:text-red-300",
    swatch: "bg-red-500",
  },
  amber: {
    label: "Amber",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    swatch: "bg-amber-500",
  },
  green: {
    label: "Green",
    chip: "bg-green-500/15 text-green-700 dark:text-green-300",
    swatch: "bg-green-500",
  },
  teal: {
    label: "Teal",
    chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    swatch: "bg-teal-500",
  },
  blue: {
    label: "Blue",
    chip: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    swatch: "bg-blue-500",
  },
  violet: {
    label: "Violet",
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    swatch: "bg-violet-500",
  },
  pink: {
    label: "Pink",
    chip: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
    swatch: "bg-pink-500",
  },
  slate: {
    label: "Slate",
    chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    swatch: "bg-slate-500",
  },
};

/** Chip classes for a colour (or neutral when null). */
export const chipClasses = (color: PlacementColor | null): string =>
  color ? COLOR_META[color].chip : "bg-surface-2 text-fg-muted";

/** Swatch classes for a colour (or a neutral ring when null). */
export const swatchClasses = (color: PlacementColor | null): string =>
  color ? COLOR_META[color].swatch : "bg-transparent border border-border";

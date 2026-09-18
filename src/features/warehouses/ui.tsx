import type { WarehouseType } from "@/db";

/** Display metadata for each warehouse/stock-room type. A label + icon aid — the type does not
 * change behaviour (see specs/roadmap/warehouses.md). */
export const WAREHOUSE_TYPE_META: Record<
  WarehouseType,
  { label: string; icon: string }
> = {
  backyard: { label: "Backyard", icon: "🌿" },
  stockroom: { label: "Stock room", icon: "📦" },
  godown: { label: "Godown", icon: "🏬" },
  other: { label: "Other", icon: "🗄️" },
};

export const WAREHOUSE_TYPES: WarehouseType[] = [
  "stockroom",
  "backyard",
  "godown",
  "other",
];

/** Small pill showing a warehouse's type. */
export function WarehouseTypeBadge({ type }: { type: WarehouseType }) {
  const meta = WAREHOUSE_TYPE_META[type];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted">
      <span aria-hidden>{meta.icon}</span>
      {meta.label}
    </span>
  );
}

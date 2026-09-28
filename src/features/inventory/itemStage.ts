import type { InventoryItem } from "@/db";

/**
 * Catalogue row stages (founder, 2026-09-28; specs/roadmap/inventory.md §11). The server enforces
 * the same rules in the `inventory_items_lock_rules` trigger.
 *   draft      → no barcode yet: everything editable
 *   barcoded   → SKU generated, no labels printed: editable; changing a SKU field or the qty
 *                resets the barcode (after a confirmation)
 *   printed    → labels printed and confirmed: frozen ("Unlock to correct…" with a reason)
 *   dispatched → any piece left the organization: frozen for good
 */
export type ItemStage = "draft" | "barcoded" | "printed" | "dispatched";

export function itemStage(
  item: Pick<InventoryItem, "status" | "labels_printed">,
  dispatched: boolean,
): ItemStage {
  if (item.status === "draft") return "draft";
  if (dispatched) return "dispatched";
  return item.labels_printed > 0 ? "printed" : "barcoded";
}

/** Fields encoded in the SKU (store · category · colour · size), plus qty (booked into stock). */
export type EditField = "name" | "mrp" | "store" | "category" | "color" | "size" | "quantity";

/** Can `field` be changed at `stage`: freely, only by resetting the barcode, or not at all? */
export function editRule(stage: ItemStage, field: EditField): "edit" | "reset" | "locked" {
  if (stage === "printed" || stage === "dispatched") return "locked";
  if (stage === "draft") return "edit";
  return field === "name" || field === "mrp" ? "edit" : "reset";
}

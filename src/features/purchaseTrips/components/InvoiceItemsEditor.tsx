import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/Input";
import type { PurchaseInvoice, PurchaseInvoiceItem } from "@/db";
import {
  createPurchaseInvoiceItem,
  updatePurchaseInvoiceItem,
  deletePurchaseInvoiceItem,
} from "../data";
import { suggestedMrpPaise, type MarginRecipe } from "@/lib/purchaseMargin";
import { formatInr, paiseToRupeeInput, rupeesToPaise } from "@/lib/money";

interface ItemRow {
  localId: string; // "" until first saved
  description: string;
  quantity: string;
  unitCostRupees: string;
  is_trending: boolean;
}
interface FormShape {
  items: ItemRow[];
}

function toRow(it: PurchaseInvoiceItem): ItemRow {
  return {
    localId: it._localId,
    description: it.description,
    quantity: String(it.quantity),
    unitCostRupees: paiseToRupeeInput(it.unit_cost_paise),
    is_trending: it.is_trending,
  };
}

function marginConfigOf(inv: PurchaseInvoice) {
  if (inv.margin_config) return { recipe: inv.margin_config as unknown as MarginRecipe };
  if (inv.margin_plugin_id) return { pluginId: inv.margin_plugin_id };
  return { recipe: { type: "flat", pct: 0 } as MarginRecipe };
}
function safeMrp(landedUnitCostPaise: number, isTrending: boolean, inv: PurchaseInvoice) {
  try {
    return suggestedMrpPaise({ landedUnitCostPaise, isTrending }, marginConfigOf(inv));
  } catch {
    return null;
  }
}

/**
 * One supplier invoice with its line items as a dynamic, inline-editable table
 * (react-hook-form useFieldArray) — so any invoice shape works: add/edit/remove rows in
 * place. "Add item" sits in the header next to "Remove invoice". Each row autosaves to
 * Dexie on blur (offline-first, via the write-through helpers); Landed/unit + MRP are
 * derived read-only columns.
 */
export function InvoiceItemsEditor({
  invoice,
  items,
  landedByLocalId,
  onRemoveInvoice,
}: {
  invoice: PurchaseInvoice;
  items: PurchaseInvoiceItem[];
  landedByLocalId: Map<string, { landedUnitCostPaise: number }>;
  onRemoveInvoice: () => void;
}) {
  const { control, register, getValues, setValue } = useForm<FormShape>({
    defaultValues: { items: items.map(toRow) },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  // Seeded once from `items` via defaultValues (the editor only mounts after this trip's
  // items are loaded in the same Dexie bundle), so no reset-on-update effect is needed —
  // that would clobber in-progress rows. Edits persist per-row; the field array is the
  // working source of truth from here on.

  // Live values (for MRP recompute as Trending toggles, and to read localId).
  const rows = useWatch({ control, name: "items" }) ?? [];

  const persistRow = async (index: number) => {
    const row = getValues(`items.${index}`);
    if (!row) return;
    const qty = Number(row.quantity);
    const unitPaise = rupeesToPaise(row.unitCostRupees);
    if (!row.description?.trim() || !Number.isInteger(qty) || qty <= 0 || unitPaise == null) {
      return; // incomplete row — nothing to persist yet
    }
    if (row.localId) {
      await updatePurchaseInvoiceItem(row.localId, {
        description: row.description.trim(),
        quantity: qty,
        unit_cost_paise: unitPaise,
        is_trending: row.is_trending,
      });
    } else {
      const created = await createPurchaseInvoiceItem({
        invoice_id: invoice.id!,
        description: row.description.trim(),
        hsn_code: null,
        quantity: qty,
        unit_cost_paise: unitPaise,
        is_trending: row.is_trending,
      });
      setValue(`items.${index}.localId`, created._localId);
    }
  };

  const removeRow = async (index: number) => {
    const row = getValues(`items.${index}`);
    if (row?.localId) await deletePurchaseInvoiceItem(row.localId);
    remove(index);
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-fg">{invoice.supplier_name}</span>
          {invoice.source === "ai_scan" && (
            <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-xs text-fg-muted">
              📷 scanned
            </span>
          )}
          {invoice.needs_review && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-600">
              ⚠ review
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="text-xs font-medium text-brand hover:underline"
            onClick={() =>
              append({
                localId: "",
                description: "",
                quantity: "1",
                unitCostRupees: "",
                is_trending: false,
              })
            }
          >
            + Add item
          </button>
          <button
            type="button"
            className="text-xs text-fg-muted hover:text-red-500"
            onClick={onRemoveInvoice}
          >
            Remove invoice
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-fg-muted">
              <th className="pb-1 pr-3">Model</th>
              <th className="pb-1 pr-3">Qty</th>
              <th className="pb-1 pr-3">Unit cost</th>
              <th className="pb-1 pr-3">Trending</th>
              <th className="pb-1 pr-3">Landed / unit</th>
              <th className="pb-1 pr-3">MRP</th>
              <th className="pb-1"></th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, i) => {
              const localId = rows[i]?.localId ?? field.localId;
              const isTrending = rows[i]?.is_trending ?? field.is_trending;
              const lr = localId ? landedByLocalId.get(localId) : undefined;
              const mrp = lr ? safeMrp(lr.landedUnitCostPaise, isTrending, invoice) : null;
              return (
                <tr key={field.id} className="border-t border-border align-top">
                  <td className="py-1 pr-3">
                    <Input
                      placeholder="Cotton saree"
                      {...register(`items.${i}.description`)}
                      onBlur={() => void persistRow(i)}
                    />
                  </td>
                  <td className="py-1 pr-3">
                    <Input
                      type="number"
                      className="w-16"
                      {...register(`items.${i}.quantity`)}
                      onBlur={() => void persistRow(i)}
                    />
                  </td>
                  <td className="py-1 pr-3">
                    <Input
                      type="number"
                      inputMode="decimal"
                      suffix="₹"
                      className="w-28"
                      {...register(`items.${i}.unitCostRupees`)}
                      onBlur={() => void persistRow(i)}
                    />
                  </td>
                  <td className="py-1 pr-3">
                    <input
                      type="checkbox"
                      checked={isTrending}
                      onChange={(e) => {
                        setValue(`items.${i}.is_trending`, e.target.checked);
                        void persistRow(i);
                      }}
                    />
                  </td>
                  <td className="py-1 pr-3">{lr ? formatInr(lr.landedUnitCostPaise) : "—"}</td>
                  <td className="py-1 pr-3">{mrp != null ? formatInr(mrp) : "—"}</td>
                  <td className="py-1">
                    <button
                      type="button"
                      className="text-xs text-fg-muted hover:text-red-500"
                      onClick={() => void removeRow(i)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
            {fields.length === 0 && (
              <tr>
                <td colSpan={7} className="py-2 text-fg-muted">
                  No items yet — click “+ Add item”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

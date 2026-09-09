import { useForm, useFieldArray, useWatch } from "react-hook-form";
import {
  type CSSProperties,
  useMemo,
} from "react";
import {
  type Column,
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
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
  if (inv.margin_config)
    return { recipe: inv.margin_config as unknown as MarginRecipe };
  if (inv.margin_plugin_id) return { pluginId: inv.margin_plugin_id };
  return { recipe: { type: "flat", pct: 0 } as MarginRecipe };
}
function safeMrp(
  landedUnitCostPaise: number,
  isTrending: boolean,
  inv: PurchaseInvoice,
) {
  try {
    return suggestedMrpPaise(
      { landedUnitCostPaise, isTrending },
      marginConfigOf(inv),
    );
  } catch {
    return null;
  }
}

/** Sticky styles for a pinned column (first column stays fixed on horizontal scroll). */
function pinningStyles<T>(column: Column<T>): CSSProperties {
  const isPinned = column.getIsPinned();
  if (!isPinned) return {};
  return {
    position: "sticky",
    left: isPinned === "left" ? `${column.getStart("left")}px` : undefined,
    zIndex: 1,
  };
}

// The field-array index is the stable coordinate every cell needs for RHF register /
// autosave, so the table's row objects just carry it and the renderers close over the
// component's `register` / `persistRow` / … via the column defs built in-scope.
interface RowMeta {
  index: number;
}

/**
 * One supplier invoice with its line items as a dynamic, inline-editable list
 * (react-hook-form useFieldArray). Two presentations of the same field array:
 * - `>= sm`: a TanStack Table with the Model column pinned left, numeric columns
 *   scroll horizontally.
 * - `< sm`: a stacked card per line item (the wide table is unreadable on a phone —
 *   constitution §6 wide-table rule).
 * "Add item" sits in the header next to "Remove invoice". Each row autosaves to Dexie
 * on blur (offline-first, via the write-through helpers); Landed/unit + MRP are derived
 * read-only values.
 */
export function InvoiceItemsEditor({
  invoice,
  items,
  landedByLocalId,
  onRemoveInvoice,
  arrived = false,
  onToggleArrived,
  readOnly = false,
}: {
  invoice: PurchaseInvoice;
  items: PurchaseInvoiceItem[];
  landedByLocalId: Map<string, { landedUnitCostPaise: number }>;
  onRemoveInvoice: () => void;
  /** Whether this invoice's parcel has arrived at the store. */
  arrived?: boolean;
  /** Toggle arrived/in-transit. Omitted (control hidden) before the trip is active. */
  onToggleArrived?: () => void;
  /** Terminal trip → items/actions are display-only. */
  readOnly?: boolean;
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
    if (
      !row.description?.trim() ||
      !Number.isInteger(qty) ||
      qty <= 0 ||
      unitPaise == null
    ) {
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

  // Derived read-only values for row `i` (landed unit cost + suggested MRP), shared by
  // the table cells and the mobile cards.
  const derivedFor = (i: number) => {
    const localId = rows[i]?.localId ?? fields[i]?.localId;
    const isTrending = rows[i]?.is_trending ?? fields[i]?.is_trending ?? false;
    const lr = localId ? landedByLocalId.get(localId) : undefined;
    const mrp = lr ? safeMrp(lr.landedUnitCostPaise, isTrending, invoice) : null;
    return {
      isTrending,
      landed: lr ? formatInr(lr.landedUnitCostPaise) : "—",
      mrp: mrp != null ? formatInr(mrp) : "—",
    };
  };

  const columns = useMemo<ColumnDef<RowMeta>[]>(() => {
    return [
      {
        id: "description",
        header: "Model",
        cell: ({ row }) => (
          <Input
            placeholder="Cotton saree"
            disabled={readOnly}
            {...register(`items.${row.original.index}.description`)}
            onBlur={() => void persistRow(row.original.index)}
          />
        ),
      },
      {
        id: "quantity",
        header: "Qty",
        cell: ({ row }) => (
          <Input
            type="number"
            className="w-16"
            disabled={readOnly}
            {...register(`items.${row.original.index}.quantity`)}
            onBlur={() => void persistRow(row.original.index)}
          />
        ),
      },
      {
        id: "unitCost",
        header: "Unit cost",
        cell: ({ row }) => (
          <Input
            type="number"
            inputMode="decimal"
            suffix="₹"
            className="w-28"
            disabled={readOnly}
            {...register(`items.${row.original.index}.unitCostRupees`)}
            onBlur={() => void persistRow(row.original.index)}
          />
        ),
      },
      {
        id: "trending",
        header: "Trending",
        cell: ({ row }) => {
          const i = row.original.index;
          return (
            <input
              type="checkbox"
              disabled={readOnly}
              checked={derivedFor(i).isTrending}
              onChange={(e) => {
                setValue(`items.${i}.is_trending`, e.target.checked);
                void persistRow(i);
              }}
            />
          );
        },
      },
      {
        id: "landed",
        header: "Landed / unit",
        cell: ({ row }) => derivedFor(row.original.index).landed,
      },
      {
        id: "mrp",
        header: "MRP",
        cell: ({ row }) => derivedFor(row.original.index).mrp,
      },
      {
        id: "remove",
        header: "",
        cell: ({ row }) =>
          readOnly ? null : (
            <button
              type="button"
              className="text-xs text-fg-muted hover:text-red-500"
              onClick={() => void removeRow(row.original.index)}
            >
              ✕
            </button>
          ),
      },
    ];
    // register / persistRow / removeRow are recreated each render; rebuilding the column
    // defs alongside them keeps the cell closures pointing at fresh form state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, rows, fields, landedByLocalId, invoice, readOnly]);

  const data = useMemo<RowMeta[]>(
    () => fields.map((_, index) => ({ index })),
    [fields],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    initialState: { columnPinning: { left: ["description"] } },
  });

  return (
    <div className="p-0 sm:rounded-lg sm:border sm:border-border sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
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
          {arrived && (
            <span className="rounded bg-tt-green-500/15 px-1.5 py-0.5 text-xs text-tt-green-600">
              ✅ arrived
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {onToggleArrived && (
            <button
              type="button"
              className="text-xs font-medium text-fg-muted hover:text-tt-green-600"
              onClick={onToggleArrived}
            >
              {arrived ? "Mark not arrived" : "Mark arrived"}
            </button>
          )}
          {!readOnly && (
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
          )}
          {!readOnly && (
            <button
              type="button"
              className="text-xs text-fg-muted hover:text-red-500"
              onClick={onRemoveInvoice}
            >
              Remove invoice
            </button>
          )}
        </div>
      </div>

      {/* Mobile (< sm): one borderless block per line item — nested bordered boxes read
          too heavy at phone width; spacing + the "Item N" label carry the separation. */}
      <div className="divide-y divide-border sm:hidden">
        {fields.map((field, i) => {
          const d = derivedFor(i);
          return (
            <div key={field.id} className="py-4 first:pt-0 last:pb-0">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-fg-muted">
                  Item {i + 1}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    className="text-xs text-fg-muted hover:text-red-500"
                    onClick={() => void removeRow(i)}
                  >
                    Remove
                  </button>
                )}
              </div>

              <Input
                label="Model"
                placeholder="Cotton saree"
                disabled={readOnly}
                {...register(`items.${i}.description`)}
                onBlur={() => void persistRow(i)}
              />

              <div className="mt-3 grid grid-cols-2 gap-3">
                <Input
                  label="Qty"
                  type="number"
                  inputMode="numeric"
                  disabled={readOnly}
                  {...register(`items.${i}.quantity`)}
                  onBlur={() => void persistRow(i)}
                />
                <Input
                  label="Unit cost"
                  type="number"
                  inputMode="decimal"
                  suffix="₹"
                  disabled={readOnly}
                  {...register(`items.${i}.unitCostRupees`)}
                  onBlur={() => void persistRow(i)}
                />
              </div>

              <label className="mt-3 flex items-center gap-2 text-sm text-fg">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={d.isTrending}
                  onChange={(e) => {
                    setValue(`items.${i}.is_trending`, e.target.checked);
                    void persistRow(i);
                  }}
                />
                Trending
              </label>

              <dl className="mt-3 flex gap-6 border-t border-border pt-2 text-sm">
                <div>
                  <dt className="text-xs text-fg-muted">Landed / unit</dt>
                  <dd className="text-fg">{d.landed}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-muted">MRP</dt>
                  <dd className="text-fg">{d.mrp}</dd>
                </div>
              </dl>
            </div>
          );
        })}
        {fields.length === 0 && (
          <p className="py-2 text-sm text-fg-muted">
            No items yet — click “+ Add item”.
          </p>
        )}
      </div>

      {/* >= sm: the full pinned-column table. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="text-left text-xs text-fg-muted"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    style={pinningStyles(header.column)}
                    className={cn(
                      "bg-bg pb-1 pr-3",
                      header.column.getIsPinned() === "left" &&
                        "border-r border-border",
                    )}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="align-top">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={pinningStyles(cell.column)}
                    className={cn(
                      "bg-bg border-t border-border py-1 pr-3",
                      cell.column.getIsPinned() === "left" &&
                        "border-r border-border",
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {fields.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="border-t border-border py-2 text-fg-muted"
                >
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

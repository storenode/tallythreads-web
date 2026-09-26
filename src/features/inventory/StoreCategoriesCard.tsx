import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import {
  createCategory,
  deleteCategory,
  useCategoriesByStore,
} from "./categories";

/** Common cloth-store departments offered as ready checkboxes. Custom ones can be added. */
const STANDARD_CATEGORIES = [
  "Sarees",
  "Dress Materials",
  "Readymade",
  "Kids Wear",
  "Men's Wear",
  "Women's Wear",
  "Blouse Pieces & Falls",
  "Home Furnishing",
  "Dhotis & Towels",
  "Accessories",
];

export interface StoreCategoriesHandle {
  /** Persist the selection against the store's existing categories (create newly
   * checked, soft-delete unchecked). Called by the store form's Save. */
  commit: () => Promise<void>;
}

/**
 * Store categories as a staged checkbox grid — standard departments preselected by
 * what the store already has, plus custom additions. Nothing is written until the
 * parent store form's Save calls {@link StoreCategoriesHandle.commit} (offline-first
 * write-through under the hood). Rendered inside the store edit form.
 */
export const StoreCategoriesFields = forwardRef<
  StoreCategoriesHandle,
  { orgId: string; storeId: string; canManage: boolean }
>(function StoreCategoriesFields({ orgId, storeId, canManage }, ref) {
  const existing = useCategoriesByStore(storeId);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  // Seed the selection from the store's existing categories once they've loaded.
  useEffect(() => {
    if (existing === undefined || initialized) return;
    const names = existing.map((c) => c.name);
    setSelected(new Set(names));
    setCustom(names.filter((n) => !STANDARD_CATEGORIES.includes(n)));
    setInitialized(true);
  }, [existing, initialized]);

  const options = useMemo(
    () => [
      ...STANDARD_CATEGORIES,
      ...custom.filter((c) => !STANDARD_CATEGORIES.includes(c)),
    ],
    [custom],
  );

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const addCustom = () => {
    const name = newName.trim();
    if (!name) return;
    if (!options.some((o) => o.toLowerCase() === name.toLowerCase())) {
      setCustom((c) => [...c, name]);
    }
    setSelected((prev) => new Set(prev).add(name));
    setNewName("");
    setAdding(false);
  };

  useImperativeHandle(
    ref,
    () => ({
      commit: async () => {
        if (!canManage) return;
        const existingRows = existing ?? [];
        const existingNames = new Set(existingRows.map((c) => c.name));
        // Create newly-selected categories the store doesn't have yet.
        for (const name of selected) {
          if (!existingNames.has(name)) {
            await createCategory({
              organization_id: orgId,
              store_id: storeId,
              name,
              next_sequence: 1,
            });
          }
        }
        // Soft-delete categories that were unchecked.
        for (const row of existingRows) {
          if (!selected.has(row.name)) {
            await deleteCategory(row._localId);
          }
        }
      },
    }),
    [selected, existing, canManage, orgId, storeId],
  );

  return (
    <Card
      title="Categories"
      desc="Departments this store sells. Tick the ones it carries (or add your own) — used to tag stock locations and, later, build SKUs. Saved with the store."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options.map((name) => (
          <label
            key={name}
            className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm"
          >
            <input
              type="checkbox"
              className="size-4 shrink-0 cursor-pointer rounded border-border accent-tt-green-500"
              checked={selected.has(name)}
              onChange={() => toggle(name)}
              disabled={!canManage}
            />
            <span className="truncate text-fg">{name}</span>
          </label>
        ))}
      </div>

      {canManage &&
        (adding ? (
          <div className="mt-3 flex items-center gap-2">
            <Input
              label={null}
              placeholder="New category (e.g. Wedding Collection)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustom()}
            />
            <Button type="button" size="sm" onClick={addCustom}>
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setNewName("");
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-3"
            onClick={() => setAdding(true)}
          >
            + Add category
          </Button>
        ))}
    </Card>
  );
});

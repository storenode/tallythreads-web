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
  STANDARD_CATEGORIES,
  createCategory,
  deleteCategory,
  updateCategory,
  useCategoriesByOrg,
  useCategoriesByStore,
} from "./categories";
import { CODE_RE, categoryCodeFor, normalizeCode } from "./codes";

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
  {
    orgId: string;
    storeId: string;
    canManage: boolean;
    /** Edit SKU category codes (org roles — inventory.manage). A code edit applies to that
     * category in every store of the org (server-side propagation). */
    canEditCodes?: boolean;
  }
>(function StoreCategoriesFields(
  { orgId, storeId, canManage, canEditCodes = false },
  ref,
) {
  const existing = useCategoriesByStore(storeId);
  const orgCategories = useCategoriesByOrg(orgId);
  // Staged code edits, by category name (applied on the store form's Save).
  const [codeEdits, setCodeEdits] = useState<Record<string, string>>({});

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

  const sameName = (a: string, b: string) =>
    a.trim().toLowerCase() === b.trim().toLowerCase();

  /** The code this store shows for a category: its saved code, else the org-wide one. */
  const savedCodeFor = (name: string) =>
    existing?.find((c) => sameName(c.name, name))?.code ??
    categoryCodeFor(name, orgCategories ?? []);

  const codeFor = (name: string) => codeEdits[name] ?? savedCodeFor(name);

  /** Why an edited code can't be used ("" = fine). Mirrors the DB trigger's rule. */
  const codeProblem = (name: string): string => {
    const code = codeEdits[name];
    if (code === undefined) return "";
    if (!CODE_RE.test(code)) return "2–6 letters/numbers";
    const clash = (orgCategories ?? []).find(
      (c) => c.code === code && !sameName(c.name, name),
    );
    return clash ? `Used by ${clash.name}` : "";
  };

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
        // A valid staged code edit, else the saved / org-wide code. The server has the
        // final say (org-wide name ↔ code consistency) and syncs any correction back.
        const finalCode = (name: string) =>
          codeEdits[name] !== undefined && codeProblem(name) === ""
            ? codeEdits[name]
            : savedCodeFor(name);
        // Create newly-selected categories the store doesn't have yet.
        for (const name of selected) {
          if (!existingNames.has(name)) {
            await createCategory({
              organization_id: orgId,
              store_id: storeId,
              name,
              code: finalCode(name),
              next_sequence: 1,
            });
          }
        }
        // Recode kept categories the user actually edited (applies org-wide on the server).
        if (canEditCodes) {
          for (const row of existingRows) {
            if (!selected.has(row.name) || codeEdits[row.name] === undefined) continue;
            const code = finalCode(row.name);
            if (code !== row.code) await updateCategory(row._localId, { code });
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
    // codeProblem/savedCodeFor read orgCategories + codeEdits, both listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, existing, canManage, canEditCodes, codeEdits, orgCategories, orgId, storeId],
  );

  return (
    <Card
      title="Categories"
      desc="Departments this store sells. Tick the ones it carries (or add your own). The short code (e.g. SAR) goes into barcodes and is the same in every store. Saved with the store."
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((name) => {
          const checked = selected.has(name);
          const problem = codeProblem(name);
          return (
            <div
              key={name}
              className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm"
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 cursor-pointer rounded border-border accent-tt-green-500"
                  checked={checked}
                  onChange={() => toggle(name)}
                  disabled={!canManage}
                />
                <span className="truncate text-fg">{name}</span>
              </label>
              {checked &&
                (canEditCodes ? (
                  <input
                    aria-label={`${name} code`}
                    title={problem || "SKU code for this category (applies in every store)"}
                    value={codeFor(name)}
                    maxLength={6}
                    autoCapitalize="characters"
                    onChange={(e) =>
                      setCodeEdits((prev) => ({
                        ...prev,
                        [name]: normalizeCode(e.target.value),
                      }))
                    }
                    className={`h-8 w-20 shrink-0 rounded-md border bg-transparent px-2 text-center font-mono text-[16px] uppercase sm:text-xs ${
                      problem ? "border-error-text text-error-text" : "border-border text-fg-muted"
                    }`}
                  />
                ) : (
                  <span
                    className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-fg-muted"
                    aria-label={`${name} code`}
                  >
                    {codeFor(name)}
                  </span>
                ))}
            </div>
          );
        })}
      </div>
      {Object.keys(codeEdits).some((n) => codeProblem(n)) && (
        <p className="mt-2 text-xs text-error-text">
          {Object.keys(codeEdits)
            .filter((n) => codeProblem(n))
            .map((n) => `${n}: ${codeProblem(n)}`)
            .join(" · ")}{" "}
          — the previous code is kept for these.
        </p>
      )}

      {canManage &&
        (adding ? (
          <div className="mt-3 flex items-center gap-2">
            <Input
              label={null}
              placeholder="New category (e.g. Wedding Collection)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                // Inside the store <form>: Enter must add the category, not submit the store.
                e.preventDefault();
                addCustom();
              }}
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

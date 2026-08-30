import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements } from "@/features/auth/entitlements";
import { useMyStores } from "./myStores";

/**
 * Persistent "switch store" control rendered in OperationsHeader — the store-level
 * counterpart of OrgSwitcher. Lists every store the member has access to regardless
 * of organization (the cross-org staffing case), highlighting the current one.
 * Renders nothing when the member is tagged to only one store.
 */
export function StoreSwitcher() {
  const { storeId: currentStoreId } = useParams<{ storeId: string }>();
  const { member } = useMember();
  const { data: entitlements } = useEntitlements(member?.id);
  const storeIds = entitlements?.stores.map((s) => s.storeId) ?? [];
  const { data: stores } = useMyStores(storeIds);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (storeIds.length <= 1) return null;

  const current = stores?.find((s) => s.id === currentStoreId);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {current?.name ?? "Switch store"}
        <ChevronDown className="size-3.5 text-fg-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          {(stores ?? []).map((store) => (
            <Link
              key={store.id}
              to={`/ops/${store.id}/billing`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-sm ${
                store.id === currentStoreId
                  ? "bg-brand-subtle-bg font-medium text-brand-text-active"
                  : "text-fg hover:bg-surface-2"
              }`}
            >
              <div>{store.name}</div>
              <div className="text-xs font-normal text-fg-muted">
                {[store.organizationName, store.store_code].filter(Boolean).join(" · ")}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

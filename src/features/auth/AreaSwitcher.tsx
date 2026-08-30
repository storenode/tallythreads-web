import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements } from "@/features/auth/entitlements";
import { getAccessibleAreas, type AreaKey } from "@/features/auth/getAccessibleAreas";

function areaFromPathname(pathname: string): AreaKey | null {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/org")) return "org";
  if (pathname.startsWith("/ops")) return "ops";
  return null;
}

/**
 * Dropdown rendered in every shell's header, next to the account menu — lets a
 * member with access to more than one top-level area (platform admin / org
 * back-office / store operations) jump between them. Renders nothing when there's
 * only one accessible area (nothing to switch to). Areas mirror RequireArea.tsx's
 * own gating (getAccessibleAreas), so "shown here" and "actually allowed" never
 * disagree.
 */
export function AreaSwitcher() {
  const { member } = useMember();
  const { data: entitlements } = useEntitlements(member?.id);
  const location = useLocation();

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

  const areas = getAccessibleAreas(entitlements);
  if (areas.length <= 1) return null;

  const currentKey = areaFromPathname(location.pathname);
  const current = areas.find((a) => a.key === currentKey) ?? areas[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {current.label}
        <ChevronDown className="size-3.5 text-fg-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          {areas.map((area) => (
            <Link
              key={area.key}
              to={area.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-sm ${
                area.key === current.key
                  ? "bg-brand-subtle-bg font-medium text-brand-text-active"
                  : "text-fg hover:bg-surface-2"
              }`}
            >
              {area.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

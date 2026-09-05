import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements } from "@/features/auth/entitlements";
import { getAccessibleAreas, type AreaKey } from "@/features/auth/getAccessibleAreas";

const log = (...args: unknown[]) => console.log("[AreaSwitcher]", ...args);

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
 *
 * Bugfix (2026-09-03): this had the same gap LaunchPage.tsx did (see that file's
 * "Bugfix (2026-09-03)" note) — `useEntitlements(member?.id)` reads `isLoading:
 * false` on the very first render of a freshly-mounted header, before `member`
 * itself has resolved, with `entitlements` still `undefined`. That made
 * getAccessibleAreas(undefined) return `[]`, so the switcher briefly rendered as
 * "nothing to switch to" (or fell back to `areas[0]` if some areas had already
 * resolved out of order) instead of waiting. Reported live as the header reading
 * the wrong area right after navigating from /launch to /ops/:storeId/billing.
 * Fixed the same way: wait for memberLoading and the "member resolved but
 * entitlements not yet" gap before computing `areas` at all.
 */
export function AreaSwitcher() {
  const { member, isLoading: memberLoading } = useMember();
  const {
    data: entitlements,
    isError: entitlementsError,
  } = useEntitlements(member?.id);
  const location = useLocation();

  const stillResolving =
    memberLoading || (Boolean(member) && !entitlements && !entitlementsError);

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

  if (stillResolving) {
    log("still resolving, rendering nothing yet", { memberId: member?.id, memberLoading });
    return null;
  }

  const areas = getAccessibleAreas(entitlements);
  if (areas.length <= 1) return null;

  const currentKey = areaFromPathname(location.pathname);
  const current = areas.find((a) => a.key === currentKey) ?? areas[0];
  log("render", { pathname: location.pathname, currentKey, current: current.key, areas: areas.map((a) => a.key) });

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

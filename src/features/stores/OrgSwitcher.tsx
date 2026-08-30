import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements } from "@/features/auth/entitlements";
import { useMyOrganizations } from "./myOrganizations";

/**
 * Persistent "switch organization" control rendered in the org shell's header
 * (via ConsoleShell's headerExtra) — distinct from AreaSwitcher, which jumps
 * between Admin/Organization/Operations; this one stays within Organization and
 * jumps between orgs. Renders nothing when the member belongs to only one.
 */
export function OrgSwitcher() {
  const { orgId: currentOrgId } = useParams<{ orgId: string }>();
  const { member } = useMember();
  const { data: entitlements } = useEntitlements(member?.id);
  const orgIds = entitlements?.organizations.map((o) => o.organizationId) ?? [];
  const { data: orgs } = useMyOrganizations(orgIds);

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

  if (orgIds.length <= 1) return null;

  const current = orgs?.find((o) => o.id === currentOrgId);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {current?.name ?? "Switch organization"}
        <ChevronDown className="size-3.5 text-fg-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          {(orgs ?? []).map((org) => (
            <Link
              key={org.id}
              to={`/org/${org.id}/stores`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`block px-4 py-2.5 text-sm ${
                org.id === currentOrgId
                  ? "bg-brand-subtle-bg font-medium text-brand-text-active"
                  : "text-fg hover:bg-surface-2"
              }`}
            >
              {org.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

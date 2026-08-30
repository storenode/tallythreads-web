import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Menu, PanelLeft } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { useMember } from "@/features/auth/useMember";
import { signOut } from "@/features/auth/signOut";

interface AdminHeaderProps {
  /** Desktop sidebar collapsed (hidden) — when true the header shows the Logo. */
  collapsed: boolean;
  onToggleMobile: () => void;
  onToggleCollapsed: () => void;
}

export function AdminHeader({
  collapsed,
  onToggleMobile,
  onToggleCollapsed,
}: AdminHeaderProps) {
  const navigate = useNavigate();
  const { member } = useMember();

  const firstName = member?.first_name?.trim() || null;
  const fullName =
    [member?.first_name, member?.last_name].filter(Boolean).join(" ").trim() ||
    null;
  const email = member?.google_email ?? null;
  const initial = (fullName ?? email ?? "A").slice(0, 1).toUpperCase();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function handleSignOut() {
    setMenuOpen(false);
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur sm:px-6">
      {/* Mobile: open the drawer */}
      <button
        type="button"
        onClick={onToggleMobile}
        className="rounded-md p-1.5 text-fg-muted hover:bg-surface-2 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      {/* Desktop: collapse / expand the sidebar */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="hidden rounded-md p-1.5 text-fg-muted hover:bg-surface-2 lg:inline-flex"
        aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
        aria-pressed={!collapsed}
      >
        <PanelLeft className="size-5" />
      </button>

      {/* Logo shows on mobile always, and on desktop only when the sidebar is hidden */}
      <Logo size="sm" className={collapsed ? "" : "lg:hidden"} />

      <div className="relative ml-auto" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full p-1 hover:bg-surface-2"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account menu"
        >
          <span className="grid size-8 place-items-center rounded-full bg-brand-subtle-bg text-xs font-semibold text-brand-text-active">
            {initial}
          </span>
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-subtle-bg text-sm font-semibold text-brand-text-active">
                {initial}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-fg">
                  {fullName ?? firstName ?? "Admin"}
                </p>
                {email && (
                  <p className="truncate text-xs text-fg-muted">{email}</p>
                )}
              </div>
            </div>

            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-fg hover:bg-surface-2"
            >
              <LogOut className="size-4 shrink-0 text-fg-muted" />
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

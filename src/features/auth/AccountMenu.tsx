import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useMember } from "@/features/auth/useMember";
import { signOut } from "@/features/auth/signOut";

/**
 * Avatar button + dropdown (name/email, Log out) shared by every back-office/
 * operations header. Extracted out of ConsoleHeader (2026-08-30) so the new
 * operations shell's header doesn't duplicate this same ~80 lines of dropdown/
 * outside-click logic.
 */
export function AccountMenu() {
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
    <div className="relative" ref={menuRef}>
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
                {fullName ?? firstName ?? "Account"}
              </p>
              {email && <p className="truncate text-xs text-fg-muted">{email}</p>}
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
  );
}

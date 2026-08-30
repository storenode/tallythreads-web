import { NavLink } from "react-router-dom";
import { X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import type { ConsoleNavSection } from "./nav";

interface ConsoleSidebarProps {
  /** Nav sections to render. */
  nav: ConsoleNavSection[];
  /** Mobile drawer open state. */
  mobileOpen: boolean;
  /** Desktop: hide the sidebar entirely. */
  collapsed: boolean;
  onClose: () => void;
}

export function ConsoleSidebar({
  nav,
  mobileOpen,
  collapsed,
  onClose,
}: ConsoleSidebarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={`fixed inset-0 z-30 bg-fg/40 transition-opacity lg:hidden ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface transition-transform ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:hidden" : "lg:static lg:translate-x-0"}`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
          <Logo size="sm" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-fg-muted hover:bg-surface-2 lg:hidden"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {nav.map((section, i) => (
            <div key={section.heading ?? i}>
              {section.heading && (
                <p className="px-3 pb-1.5 text-xs font-medium uppercase tracking-wide text-fg-muted">
                  {section.heading}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-brand-subtle-bg text-brand-text-active"
                            : "text-fg-muted hover:bg-surface-2 hover:text-fg"
                        }`
                      }
                    >
                      <item.icon className="size-4 shrink-0" />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

import { Menu, PanelLeft } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { AreaSwitcher } from "@/features/auth/AreaSwitcher";
import { AccountMenu } from "@/features/auth/AccountMenu";

interface ConsoleHeaderProps {
  /** Desktop sidebar collapsed (hidden) — when true the header shows the Logo. */
  collapsed: boolean;
  onToggleMobile: () => void;
  onToggleCollapsed: () => void;
}

export function ConsoleHeader({
  collapsed,
  onToggleMobile,
  onToggleCollapsed,
}: ConsoleHeaderProps) {
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

      <div className="ml-auto flex items-center gap-3">
        <AreaSwitcher />
        <AccountMenu />
      </div>
    </header>
  );
}

import { useState } from "react";
import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { ConsoleSidebar } from "./ConsoleSidebar";
import { ConsoleHeader } from "./ConsoleHeader";
import type { ConsoleNavSection } from "./nav";

interface ConsoleShellProps {
  /** Sidebar nav sections for this area (platform admin, org back-office, …). */
  nav: ConsoleNavSection[];
  /** Extra header content rendered before AreaSwitcher/AccountMenu — e.g. OrgSwitcher
   * for the org back-office. Left undefined for areas (like /admin) with nothing to
   * switch between. */
  headerExtra?: ReactNode;
}

/**
 * Back-office chrome — collapsible sidebar + sticky header wrapping an <Outlet>.
 * Shared by the platform admin (/admin/*) and org (/org/*) route trees. The
 * customer-facing app (billing, inventory) gets its own AppShell instead.
 */
export default function ConsoleShell({ nav, headerExtra }: ConsoleShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-dvh bg-bg pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-fg">
      <ConsoleSidebar
        nav={nav}
        mobileOpen={mobileOpen}
        collapsed={collapsed}
        onClose={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <ConsoleHeader
          collapsed={collapsed}
          onToggleMobile={() => setMobileOpen((v) => !v)}
          onToggleCollapsed={() => setCollapsed((v) => !v)}
          extra={headerExtra}
        />

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

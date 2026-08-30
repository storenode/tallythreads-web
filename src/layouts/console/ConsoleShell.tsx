import { useState } from "react";
import { Outlet } from "react-router-dom";
import { ConsoleSidebar } from "./ConsoleSidebar";
import { ConsoleHeader } from "./ConsoleHeader";
import type { ConsoleNavSection } from "./nav";

interface ConsoleShellProps {
  /** Sidebar nav sections for this area (platform admin, org back-office, …). */
  nav: ConsoleNavSection[];
}

/**
 * Back-office chrome — collapsible sidebar + sticky header wrapping an <Outlet>.
 * Shared by the platform admin (/admin/*) and org (/org/*) route trees. The
 * customer-facing app (billing, inventory) gets its own AppShell instead.
 */
export default function ConsoleShell({ nav }: ConsoleShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-dvh bg-bg text-fg">
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
        />

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

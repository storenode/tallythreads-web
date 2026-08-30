import type { ComponentType } from "react";

/**
 * Nav model for the console shell (ConsoleShell). Each consuming area — the
 * platform admin, an org's back-office — supplies its own list of sections;
 * the shell only renders them.
 */
export interface ConsoleNavItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  /** `true` -> only match the exact path (used for an index route). */
  end?: boolean;
}

export interface ConsoleNavSection {
  heading?: string;
  items: ConsoleNavItem[];
}

import {
  LayoutDashboard,
  Building2,
  Store,
  Users,
  ShieldCheck,
  CreditCard,
  ScrollText,
  Settings,
} from "lucide-react";
import type { ComponentType } from "react";

export interface AdminNavItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  /** `true` -> only match the exact path (used for the index route). */
  end?: boolean;
}

export interface AdminNavSection {
  heading?: string;
  items: AdminNavItem[];
}

// Static placeholders — swap `to` targets / add-remove items as routes land.
export const adminNav: AdminNavSection[] = [
  {
    items: [
      { label: "Dashboard", to: "/admin", icon: LayoutDashboard, end: true },
    ],
  },
  {
    heading: "Tenancy",
    items: [
      { label: "Organizations", to: "/admin/organizations", icon: Building2 },
      { label: "Stores", to: "/admin/stores", icon: Store },
      { label: "Members", to: "/admin/members", icon: Users },
    ],
  },
  {
    heading: "Access",
    items: [
      { label: "Roles & Permissions", to: "/admin/roles", icon: ShieldCheck },
      { label: "Audit Log", to: "/admin/audit", icon: ScrollText },
    ],
  },
  {
    heading: "Platform",
    items: [
      { label: "Billing", to: "/admin/billing", icon: CreditCard },
      { label: "Settings", to: "/admin/settings", icon: Settings },
    ],
  },
];

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
import type { ConsoleNavSection } from "@/layouts/console/nav";

// Static placeholders — swap `to` targets / add-remove items as routes land.
export const adminNav: ConsoleNavSection[] = [
  {
    items: [
      { label: "Dashboard", to: "/admin", icon: LayoutDashboard, end: true },
    ],
  },
  {
    heading: "Tenancy",
    items: [
      { label: "Organizations", to: "/admin/organizations", icon: Building2 },
      { label: "Stores", to: "/org/stores", icon: Store },
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

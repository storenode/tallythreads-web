import {
  LayoutDashboard,
  Building2,
  Store,
  ShieldCheck,
  CreditCard,
  ScrollText,
  Presentation,
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
      { label: "Audit Log", to: "/admin/audit", icon: ScrollText },
      { label: "Demo", to: "/admin/demo", icon: Presentation },
      { label: "Roles & Permissions", to: "/admin/roles", icon: ShieldCheck },
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

import {
  LayoutDashboard,
  Building2,
  Store,
  CreditCard,
  ScrollText,
  Settings,
  Truck,
} from "lucide-react";
import type { ConsoleNavSection } from "@/layouts/console/nav";

// Static placeholders — swap `to` targets / add-remove items as routes land.
// A function, not a static list, because "Organizations" points at the edit page
// for the current :orgId, only known at render time.
export function getOrgAdminNav(orgId: string): ConsoleNavSection[] {
  return [
    {
      items: [
        { label: "Dashboard", to: "/admin", icon: LayoutDashboard, end: true },
      ],
    },
    {
      heading: "Tenancy",
      items: [
        {
          label: "Organizations",
          to: `/org/${orgId}/edit`,
          icon: Building2,
        },
        { label: "Stores", to: `/org/${orgId}/stores`, icon: Store },
        {
          label: "Purchase Trips",
          to: `/org/${orgId}/purchase-trips`,
          icon: Truck,
        },
      ],
    },
    {
      heading: "Access",
      items: [{ label: "Audit Log", to: "/admin/audit", icon: ScrollText }],
    },
    {
      heading: "Platform",
      items: [
        { label: "Billing", to: "/admin/billing", icon: CreditCard },
        { label: "Settings", to: "/admin/settings", icon: Settings },
      ],
    },
  ];
}

// Dedicated org back-office nav. A function, not a static list, because every link
// needs to carry the current :orgId (2026-08-30, once /org became org-scoped) —
// unlike adminNav, which has nowhere dynamic to point.
export function getOrgNav(orgId: string): ConsoleNavSection[] {
  return [
    {
      items: [{ label: "Stores", to: `/org/${orgId}/stores`, icon: Store }],
    },
  ];
}

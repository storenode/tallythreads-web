import {
  Receipt,
  Boxes,
  Truck,
  BarChart3,
  Settings,
  PackageOpen,
} from "lucide-react";
import type { ComponentType } from "react";

export interface OperationsNavItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
}

// Footer tab bar items for the operations shell. A function, not a static list,
// because every link needs to carry the current :storeId (2026-08-30, once /ops
// became store-scoped). Pages are stubs for now — M2 (offline sync) hasn't started
// and M3/M5 (Inventory/POS) aren't built yet, the same caveat the pre-cleanup /app
// shell had. See M-role-permission-model.md for which roles (store_manager,
// store_sales_staff, ...) land here.
//
// `perms` hides tabs the member can't use (defense-in-depth on top of the page/RLS checks).
// Inventory needs `inventory.read` for this store — held by store_manager / sales / temp staff
// and cascaded to org_owner / org_manager.
export function getOperationsNav(
  storeId: string,
  perms: { canViewInventory?: boolean } = {},
): OperationsNavItem[] {
  return [
    { label: "Billing", to: `/ops/${storeId}/billing`, icon: Receipt },
    ...(perms.canViewInventory
      ? [{ label: "Inventory", to: `/ops/${storeId}/inventory`, icon: Boxes }]
      : []),
    {
      label: "Incoming Stock",
      to: `/ops/${storeId}/incoming`,
      icon: PackageOpen,
    },
    { label: "Trips", to: `/ops/${storeId}/trips`, icon: Truck },
    { label: "Reports", to: `/ops/${storeId}/reports`, icon: BarChart3 },
    { label: "Settings", to: `/ops/${storeId}/settings`, icon: Settings },
  ];
}

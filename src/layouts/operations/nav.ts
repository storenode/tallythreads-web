import { Receipt, Boxes, Truck, BarChart3, Settings } from "lucide-react";
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
export function getOperationsNav(storeId: string): OperationsNavItem[] {
  return [
    { label: "Billing", to: `/ops/${storeId}/billing`, icon: Receipt },
    { label: "Inventory", to: `/ops/${storeId}/inventory`, icon: Boxes },
    { label: "Trips", to: `/ops/${storeId}/trips`, icon: Truck },
    { label: "Reports", to: `/ops/${storeId}/reports`, icon: BarChart3 },
    { label: "Settings", to: `/ops/${storeId}/settings`, icon: Settings },
  ];
}

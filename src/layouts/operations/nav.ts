import { Receipt, Boxes, Truck, BarChart3, Settings } from "lucide-react";
import type { ComponentType } from "react";

export interface OperationsNavItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
}

// Footer tab bar items for the operations shell (/ops). Pages are stubs for now —
// M2 (offline sync) hasn't started and M3/M5 (Inventory/POS) aren't built yet, the
// same caveat the pre-cleanup /app shell had. See M-role-permission-model.md for
// which roles (store_manager, store_sales_staff, ...) land here.
export const operationsNav: OperationsNavItem[] = [
  { label: "Billing", to: "/ops/billing", icon: Receipt },
  { label: "Inventory", to: "/ops/inventory", icon: Boxes },
  { label: "Trips", to: "/ops/trips", icon: Truck },
  { label: "Reports", to: "/ops/reports", icon: BarChart3 },
  { label: "Settings", to: "/ops/settings", icon: Settings },
];

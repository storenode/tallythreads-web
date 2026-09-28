import { Receipt, Boxes, Bot, BarChart3, Settings } from "lucide-react";
import type { ComponentType } from "react";

export interface OperationsNavItem {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
}

// Footer tab bar items for the operations shell (store sales staff and managers). A function,
// not a static list, because every link carries the current :storeId.
//
// 2026-09-28: Inventory and Incoming Stock merged into one tab (two in-page tabs, see
// InventoryPage), Trips removed, Agent added (placeholder until the Assistant is built,
// specs/roadmap/assistant.md). Inventory shows for everyone: its Inventory tab checks
// `inventory.read`, its Incoming Stock tab needs none (the price-free feed it always was).
export function getOperationsNav(storeId: string): OperationsNavItem[] {
  return [
    { label: "Billing", to: `/ops/${storeId}/billing`, icon: Receipt },
    { label: "Inventory", to: `/ops/${storeId}/inventory`, icon: Boxes },
    { label: "Agent", to: `/ops/${storeId}/agent`, icon: Bot },
    { label: "Reports", to: `/ops/${storeId}/reports`, icon: BarChart3 },
    { label: "Settings", to: `/ops/${storeId}/settings`, icon: Settings },
  ];
}

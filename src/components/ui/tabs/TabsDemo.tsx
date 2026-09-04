import { LayoutGrid, Bell, BarChart3, Users } from "lucide-react";
import { Tabs, type TabItem } from "./Tabs";

const items: TabItem[] = [
  {
    id: "overview",
    label: "Overview",
    icon: <LayoutGrid size={20} />,
    content: <p className="text-sm text-gray-500">Overview panel content.</p>,
  },
  {
    id: "notification",
    label: "Notification",
    icon: <Bell size={20} />,
    content: (
      <p className="text-sm text-gray-500">Notification panel content.</p>
    ),
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: <BarChart3 size={20} />,
    content: <p className="text-sm text-gray-500">Analytics panel content.</p>,
  },
  {
    id: "customers",
    label: "Customers",
    icon: <Users size={20} />,
    content: <p className="text-sm text-gray-500">Customers panel content.</p>,
  },
];

export function TabsDemo() {
  return <Tabs items={items} defaultActiveId="overview" />;
}

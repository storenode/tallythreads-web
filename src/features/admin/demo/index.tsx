import { useMemo } from "react";
import { User, Building2, Network } from "lucide-react";
import { Tabs, type TabItem } from "@/components/ui/tabs/Tabs";
import { type RegistrationType } from "../organizations/organizations";
import DemoIndependent from "./demo.independent";
import DemoChain from "./demo.chain";
import DemoFranchise from "./demo.franchise";

const TAB_DEFS: {
  id: RegistrationType;
  label: string;
  icon: TabItem["icon"];
  Content: React.ComponentType;
}[] = [
  {
    id: "independent",
    label: "Individual",
    icon: <User size={20} />,
    Content: DemoIndependent,
  },
  {
    id: "chain",
    label: "Chain",
    icon: <Building2 size={20} />,
    Content: DemoChain,
  },
  {
    id: "franchise",
    label: "Franchise",
    icon: <Network size={20} />,
    Content: DemoFranchise,
  },
];

export default function DemoPage() {
  const items = useMemo<TabItem[]>(
    () =>
      TAB_DEFS.map(({ id, label, icon, Content }) => ({
        id,
        label,
        icon,
        content: <Content />,
      })),
    [],
  );

  return <Tabs items={items} defaultActiveId="independent" />;
}

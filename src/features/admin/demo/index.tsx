import { useMemo } from "react";
import { User, Building2, Network } from "lucide-react";
import { Tabs, type TabItem } from "@/components/ui/tabs/Tabs";
import {
  useOrganizations,
  type Organization,
  type RegistrationType,
} from "../organizations/organizations";

const TAB_DEFS: {
  id: RegistrationType;
  label: string;
  icon: TabItem["icon"];
}[] = [
  { id: "independent", label: "Individual", icon: <User size={20} /> },
  { id: "chain", label: "Multi-Location", icon: <Building2 size={20} /> },
  { id: "franchise", label: "Franchise", icon: <Network size={20} /> },
];

function OrgList({ orgs }: { orgs: Organization[] }) {
  if (orgs.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        No demo organizations of this type yet.
      </p>
    );
  }
  return (
    <ul>
      {orgs.map((org) => (
        <li key={org.id}>
          {org.name} — {org.registration_type ?? "unset"}
        </li>
      ))}
    </ul>
  );
}

export default function DemoPage() {
  const { data: organizations = [], isLoading, isError } = useOrganizations();

  const demoOrgs = useMemo(
    () => organizations.filter((o) => o.is_demo),
    [organizations],
  );

  const items = useMemo<TabItem[]>(
    () =>
      TAB_DEFS.map((def) => ({
        id: def.id,
        label: def.label,
        icon: def.icon,
        content: (
          <OrgList
            orgs={demoOrgs.filter((o) => o.registration_type === def.id)}
          />
        ),
      })),
    [demoOrgs],
  );

  if (isLoading) return null;
  if (isError) return <div>Couldn't load organizations.</div>;
  if (demoOrgs.length === 0) {
    return (
      <div>No demo organizations yet. Mark one "demo" in Organizations.</div>
    );
  }

  return <Tabs items={items} defaultActiveId="independent" />;
}

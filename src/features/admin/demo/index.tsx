import { useState } from "react";
import { User, Building2, Network, type LucideIcon } from "lucide-react";
import { PageHeading } from "@/components/ui/PageHeading";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  useOrganizations,
  type OrganizationFullDetail,
  type RegistrationType,
} from "../organizations/organizations";
import { OrganizationCard } from "../organizations/OrganizationCard";
import { RegistrationTypeBadge } from "../organizations/registrationType";
import { INDEPENDENT_DEMO_DEFAULTS } from "./components/independent.demo";
import { CHAIN_DEMO_DEFAULTS } from "./components/chain.demo";
import { FRANCHISE_DEMO_DEFAULTS } from "./components/franchise.demo";
import { CreateIndependentForm } from "./components/independent.form";
import { CreateChainForm } from "./components/chain.form";
import { CreateFranchiseForm } from "./components/franchise.form";
import { DemoLaunchControl } from "./components/DemoLaunchControl";

interface DemoSlot {
  type: RegistrationType;
  name: string;
  icon: LucideIcon;
  Form: (props: { onDone?: () => void }) => React.ReactElement;
}

const SLOTS: DemoSlot[] = [
  {
    type: "independent",
    name: INDEPENDENT_DEMO_DEFAULTS.org.name,
    icon: User,
    Form: CreateIndependentForm,
  },
  {
    type: "chain",
    name: CHAIN_DEMO_DEFAULTS.org.name,
    icon: Building2,
    Form: CreateChainForm,
  },
  {
    type: "franchise",
    name: FRANCHISE_DEMO_DEFAULTS.org.name,
    icon: Network,
    Form: CreateFranchiseForm,
  },
];

/**
 * Placeholder card for a demo type that hasn't been seeded yet: the default
 * org name + a Create button that opens the (prefilled, editable) demo form.
 * Once created, the slot renders the shared {@link OrganizationCard} instead —
 * same card (and edit flow) as the directory.
 */
function EmptyDemoCard({
  type,
  name,
  icon: Icon,
  onCreate,
}: {
  type: RegistrationType;
  name: string;
  icon: LucideIcon;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col rounded-md border border-dashed border-border bg-surface p-4 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted sm:size-18">
          <Icon aria-hidden className="size-7" strokeWidth={1.5} />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-lg font-medium text-fg">{name}</h3>
          <div className="mt-1">
            <RegistrationTypeBadge type={type} />
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm text-fg-muted">Not created yet.</p>

      <Button className="mt-4 w-fit" onClick={onCreate}>
        Create demo
      </Button>
    </div>
  );
}

export default function DemoPage() {
  const { data: orgs, isLoading, isError } = useOrganizations();
  const [creating, setCreating] = useState<RegistrationType | null>(null);

  const demoOrg = (type: RegistrationType): OrganizationFullDetail | undefined =>
    orgs?.find((o) => o.is_demo && o.registration_type === type);

  // Create view: the prefilled, editable demo form for the chosen type.
  if (creating) {
    const slot = SLOTS.find((s) => s.type === creating)!;
    const Form = slot.Form;
    return (
      <div className="space-y-6">
        <PageHeading
          action={
            <button
              type="button"
              onClick={() => setCreating(null)}
              className="text-sm font-medium text-fg-muted hover:text-fg"
            >
              ← Back
            </button>
          }
        >
          New demo · {slot.name}
        </PageHeading>

        <p className="text-sm text-fg-muted">
          Most fields are prefilled with sample data — edit a few, then create.
          Stores, members, stock rooms, placements, and purchase trips are all
          seeded automatically.
        </p>

        <Form onDone={() => setCreating(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading>Demo organizations</PageHeading>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      )}
      {isError && (
        <p className="text-sm text-red-500">Couldn&apos;t load organizations.</p>
      )}

      {!isLoading && !isError && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SLOTS.map((slot) => {
            const org = demoOrg(slot.type);
            return org ? (
              <OrganizationCard
                key={slot.type}
                org={org}
                action={<DemoLaunchControl org={org} />}
              />
            ) : (
              <EmptyDemoCard
                key={slot.type}
                type={slot.type}
                name={slot.name}
                icon={slot.icon}
                onCreate={() => setCreating(slot.type)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

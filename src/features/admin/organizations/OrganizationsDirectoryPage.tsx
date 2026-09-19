import { useNavigate } from "react-router-dom";
import { PageHeading } from "@/components/ui/PageHeading";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useOrganizations } from "./organizations";
import { OrganizationCard } from "./OrganizationCard";

/**
 * The organizations directory — the proper entry point (from the left nav) to
 * every organization. Shows the org cards grid and "Add Organization"; each
 * card opens the setup wizard. Replaces the old OrganizationListPage, and is
 * the same card the demo page uses.
 */
export default function OrganizationsDirectoryPage() {
  const { data: organizations, isLoading, isError } = useOrganizations();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex w-full flex-col justify-center gap-4 px-2 md:flex-row md:justify-between">
        <PageHeading>Organizations</PageHeading>
        <Button
          size="sm"
          className="w-full md:max-w-[200px]"
          onClick={() => navigate("/admin/setup/new")}
        >
          Add Organization
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      )}

      {isError && (
        <p className="text-sm text-red-500">Couldn&apos;t load organizations.</p>
      )}

      {!isLoading && !isError && (organizations?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-fg-muted">
            No organizations yet — add your first one to get started.
          </p>
        </div>
      )}

      {(organizations?.length ?? 0) > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {organizations!.map((org) => (
            <OrganizationCard key={org.id} org={org} />
          ))}
        </div>
      )}
    </div>
  );
}

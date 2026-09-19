import { PageHeading } from "@/components/ui/PageHeading";
import { Spinner } from "@/components/ui/Spinner";
import { useOrganizations } from "@/features/admin/organizations/organizations";
import { OrganizationCard } from "@/features/admin/organizations/OrganizationCard";

/**
 * Org-console "Organizations" — mirrors the admin directory but scoped to the
 * organizations this member can access (RLS-filtered), usually just one. Reuses
 * the shared {@link OrganizationCard}, pointed at the org-scoped setup wizard,
 * with no delete/launch (an org member can't delete their own org).
 */
export default function OrgOrganizationsPage() {
  const { data: organizations, isLoading, isError } = useOrganizations();

  return (
    <div className="space-y-6">
      <PageHeading>Organizations</PageHeading>

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
          <p className="text-sm text-fg-muted">No organizations to show.</p>
        </div>
      )}

      {(organizations?.length ?? 0) > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {organizations!.map((org) => (
            <OrganizationCard
              key={org.id}
              org={org}
              to={`/org/${org.id}/setup/organization`}
              showDelete={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}

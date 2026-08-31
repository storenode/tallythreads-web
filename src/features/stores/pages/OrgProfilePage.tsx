import { useParams, Link } from "react-router-dom";
import { PageHeading } from "@/components/ui/PageHeading";
import { Spinner } from "@/components/ui/Spinner";
import {
  MembersCard,
  OrganizationEditFormCard,
} from "@/features/admin/organizations/OrganizationForm";
import { useOrganization } from "@/features/admin/organizations/organizations";

// Org self-service view of the organization profile. Same form as the admin
// console edit page, but gated by RequireArea "org" + RequireOrgAccess instead
// of "admin", and without the archive (Danger zone) flow.
export default function OrgProfilePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data: org, isLoading, isError } = useOrganization(orgId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  }

  if (isError || !org || !orgId) {
    return (
      <div className="space-y-4">
        <PageHeading>Organization not found</PageHeading>
        <p className="text-sm text-fg-muted">
          This organization doesn&apos;t exist or couldn&apos;t be loaded.
        </p>
        <Link
          to={`/org/${orgId ?? ""}`}
          className="text-sm font-medium text-tt-green-600"
        >
          ← Back
        </Link>
      </div>
    );
  }

  const doneTo = `/org/${orgId}`;

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <Link
            to={doneTo}
            className="text-sm font-medium text-fg-muted hover:text-fg"
          >
            ← Back
          </Link>
        }
      >
        {org.name}
      </PageHeading>

      {!org.primary_contact_member_id && (
        <p className="rounded-lg border border-warning-text/40 bg-warning-bg px-3 py-2 text-sm text-warning-text">
          This organization has no primary contact. Assign one from the Members
          section below.
        </p>
      )}

      <OrganizationEditFormCard org={org} orgId={orgId} doneTo={doneTo} />

      <MembersCard org={org} />
    </div>
  );
}

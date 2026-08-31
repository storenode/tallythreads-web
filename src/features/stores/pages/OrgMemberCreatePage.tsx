import { useNavigate, useParams, Link } from "react-router-dom";
import { PageHeading } from "@/components/ui/PageHeading";
import { MemberForm } from "@/components/forms/member/MemberForm";

// Org-scoped add-member page — what the "Add member" button in MembersCard
// (OrganizationForm.tsx) now navigates to, instead of expanding an inline panel.
// Reached with organization id context from the route; navigates back to the org
// edit page (where MembersCard lives) on success or Cancel/Back.
export default function OrgMemberCreatePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const backTo = `/org/${orgId}/edit`;

  if (!orgId) return null;

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <Link
            to={backTo}
            className="text-sm font-medium text-fg-muted hover:text-fg"
          >
            ← Back
          </Link>
        }
      >
        Add member
      </PageHeading>

      <MemberForm
        organizationId={orgId}
        onSuccess={() => navigate(backTo)}
        onCancel={() => navigate(backTo)}
      />
    </div>
  );
}

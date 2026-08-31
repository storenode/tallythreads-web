import { useNavigate, useParams, Link } from "react-router-dom";
import { PageHeading } from "@/components/ui/PageHeading";
import { Spinner } from "@/components/ui/Spinner";
import { MemberForm } from "@/components/forms/member/MemberForm";
import { useOrgMemberDetail } from "@/features/admin/organizations/organizations";

// Org-scoped edit-member page — what clicking a member's email/name in
// MembersCard (OrganizationForm.tsx) now navigates to. Pre-fills MemberForm in
// edit mode from useOrgMemberDetail; navigates back to the org edit page (where
// MembersCard lives) on success, Cancel, or Back.
export default function OrgMemberEditPage() {
  const { orgId, memberId } = useParams<{ orgId: string; memberId: string }>();
  const navigate = useNavigate();
  const backTo = `/org/${orgId}/edit`;

  const {
    data: detail,
    isLoading,
    isError,
  } = useOrgMemberDetail(orgId, memberId);

  if (!orgId || !memberId) return null;

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
        Edit member
      </PageHeading>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      )}

      {!isLoading && (isError || !detail) && (
        <p className="text-sm text-red-500">
          Couldn&apos;t load this member. They may no longer be part of this
          organization.
        </p>
      )}

      {!isLoading && detail && (
        <MemberForm
          organizationId={orgId}
          edit={{
            memberId,
            email: detail.email,
            roleName: detail.roleName,
            initialValues: detail,
          }}
          onSuccess={() => navigate(backTo)}
          onCancel={() => navigate(backTo)}
        />
      )}
    </div>
  );
}

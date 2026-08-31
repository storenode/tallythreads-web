import { useNavigate, useParams, Link } from "react-router-dom";
import { PageHeading } from "@/components/ui/PageHeading";
import { Spinner } from "@/components/ui/Spinner";
import { MemberForm } from "@/components/forms/member/MemberForm";
import { useStoreMemberDetail } from "../storesAdmin";

// Store-scoped edit-member page — what clicking a member's email/name in
// StoreMembersCard (StoreEditPage.tsx) now navigates to. Mirrors
// OrgMemberEditPage but pre-fills from useStoreMemberDetail and passes storeId
// through to MemberForm. Navigates back to the store edit page on success,
// Cancel, or Back.
export default function StoreMemberEditPage() {
  const { orgId, storeId, memberId } = useParams<{
    orgId: string;
    storeId: string;
    memberId: string;
  }>();
  const navigate = useNavigate();
  const backTo = `/org/${orgId}/stores/${storeId}/edit`;

  const {
    data: detail,
    isLoading,
    isError,
  } = useStoreMemberDetail(storeId, memberId);

  if (!orgId || !storeId || !memberId) return null;

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
          store.
        </p>
      )}

      {!isLoading && detail && (
        <MemberForm
          organizationId={orgId}
          storeId={storeId}
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

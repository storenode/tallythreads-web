import { useNavigate, useParams, Link } from "react-router-dom";
import { PageHeading } from "@/components/ui/PageHeading";
import { MemberForm } from "@/components/forms/member/MemberForm";

// Store-scoped add-member page — what the "Add member" button on the store edit
// page's Members grid navigates to. Reached with both organization id and store
// id context from the route; navigates back to the store edit page on success or
// Cancel/Back.
export default function StoreMemberCreatePage() {
  const { orgId, storeId } = useParams<{ orgId: string; storeId: string }>();
  const navigate = useNavigate();
  const backTo = `/org/${orgId}/stores/${storeId}/edit`;

  if (!orgId || !storeId) return null;

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
        storeId={storeId}
        onSuccess={() => navigate(backTo)}
        onCancel={() => navigate(backTo)}
      />
    </div>
  );
}

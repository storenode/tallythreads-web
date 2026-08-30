import { PageHeading } from "@/components/ui/PageHeading";
import { Card } from "@/components/ui/Card";
import { useEntitlements } from "@/features/auth/entitlements";
import { useMember } from "@/features/auth/useMember";
import { useOrganizations } from "@/features/admin/organizations/organizations";

export default function AdminHomePage() {
  const { member } = useMember();
  const { data } = useEntitlements(member?.id);
  // Platform-wide org count — NOT data.organizations.length, which is how many
  // org-level ROLE memberships the signed-in admin personally holds (one entry per
  // membership row, not deduplicated by org). Those aren't the same number: an admin
  // who's also been invited into one org under two different roles would read "2"
  // there while the platform only has 1 organization. This queries the real
  // organizations table (already deleted_at-filtered) instead.
  const { data: organizations } = useOrganizations();

  return (
    <div className="space-y-6">
      <PageHeading>Dashboard</PageHeading>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Organizations">
          <p className="text-2xl font-semibold text-fg">
            {organizations?.length ?? "—"}
          </p>
        </Card>
        <Card title="Stores">
          <p className="text-2xl font-semibold text-fg">
            {data?.stores.length ?? "—"}
          </p>
          <p className="mt-1 text-xs text-fg-muted">
            Your own store-level access — not a platform-wide count yet.
          </p>
        </Card>
        <Card title="Platform role">
          <p className="text-2xl font-semibold text-fg">
            {data?.platformRole ?? "—"}
          </p>
        </Card>
      </div>
    </div>
  );
}

import { PageHeading } from "@/components/ui/PageHeading";
import { Card } from "@/components/ui/Card";
import { useEntitlements } from "@/features/auth/entitlements";
import { useMember } from "@/features/auth/useMember";

export default function AdminHomePage() {
  const { member } = useMember();
  const { data } = useEntitlements(member?.id);

  return (
    <div className="space-y-6">
      <PageHeading>Dashboard</PageHeading>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Organizations">
          <p className="text-2xl font-semibold text-fg">
            {data?.organizations.length ?? "—"}
          </p>
        </Card>
        <Card title="Stores">
          <p className="text-2xl font-semibold text-fg">
            {data?.stores.length ?? "—"}
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

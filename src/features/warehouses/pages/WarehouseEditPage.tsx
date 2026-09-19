import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { Spinner } from "@/components/ui/Spinner";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements, hasPermission } from "@/features/auth/entitlements";
import { useWarehouse, deleteWarehouseCascade } from "../data";
import { WarehouseEditCard } from "../WarehouseEditCard";

export default function WarehouseEditPage() {
  const { orgId, warehouseId } = useParams<{ orgId: string; warehouseId: string }>();
  const navigate = useNavigate();
  const listTo = `/org/${orgId}/stores`;
  const { member } = useMember();
  const { data: entitlements } = useEntitlements(member?.id);

  const warehouse = useWarehouse(warehouseId);

  const canDesign = hasPermission(entitlements, "store.edit", {
    organizationId: orgId,
  });

  if (warehouse === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  }
  if (!warehouse || !orgId || !warehouseId) {
    return <p className="text-sm text-red-500">Stock room not found.</p>;
  }

  const onDelete = async () => {
    if (
      !window.confirm(
        `Delete stock room “${warehouse.name}”? This also removes its store attachments and its placements.`,
      )
    )
      return;
    await deleteWarehouseCascade(warehouse._localId);
    navigate(listTo);
  };

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <Link to={listTo} className="text-sm font-medium text-fg-muted hover:text-fg">
            ← Back
          </Link>
        }
      >
        {warehouse.name}
      </PageHeading>

      <WarehouseEditCard warehouse={warehouse} orgId={orgId} canDesign={canDesign} />

      {canDesign && (
        <Card title="Danger zone" desc="Deleting a stock room removes it, its attachments, and its placements.">
          <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
            Delete stock room
          </Button>
        </Card>
      )}
    </div>
  );
}

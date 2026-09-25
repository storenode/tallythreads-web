import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeading } from "@/components/ui/PageHeading";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useArchivedStoresByOrg, useStoresByOrg } from "../stores";
import { useOrganization } from "@/features/admin/organizations/organizations";
import { canAddStore, storeLimitReason } from "@/features/admin/organizations/orgPolicy";
import { WarehousesGrid } from "@/features/warehouses/WarehousesGrid";
import { WarehouseMap } from "@/features/warehouses/WarehouseMap";

export default function StoresListPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { data: stores, isLoading, isError } = useStoresByOrg(orgId);
  const { data: org } = useOrganization(orgId);

  const addAllowed = canAddStore(
    org?.registration_type ?? null,
    stores?.length ?? 0,
  );
  const limitReason = storeLimitReason(org?.registration_type ?? null);

  const [showArchived, setShowArchived] = useState(false);
  const {
    data: archivedStores,
    isLoading: archivedLoading,
    isError: archivedError,
  } = useArchivedStoresByOrg(showArchived ? orgId : undefined);

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/org/${orgId}/stock-rooms/new`)}
            >
              New stock room
            </Button>
            <Button
              size="sm"
              onClick={() => navigate(`/org/${orgId}/stores/new`)}
              disabled={!addAllowed}
              title={!addAllowed && limitReason ? limitReason : undefined}
            >
              New store
            </Button>
          </div>
        }
      >
        Stores
      </PageHeading>

      {!addAllowed && limitReason && (
        <p className="text-xs text-fg-muted">{limitReason}</p>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      )}

      {isError && (
        <p className="text-sm text-red-500">Couldn&apos;t load stores.</p>
      )}

      {!isLoading && !isError && (stores?.length ?? 0) === 0 && (
        <p className="text-sm text-fg-muted">No stores yet.</p>
      )}

      {!isLoading && !isError && (stores?.length ?? 0) > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stores!.map((store) => (
            <div
              key={store.id}
              className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5"
            >
              <div>
                <h3 className="text-base font-medium text-fg">{store.name}</h3>
                {store.store_code && (
                  <p className="mt-1 text-sm text-fg-muted">
                    Code: {store.store_code}
                  </p>
                )}
              </div>
              <div className="mt-4 flex justify-end border-t border-border pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    navigate(`/org/${orgId}/stores/${store.id}/edit`)
                  }
                >
                  Edit
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {orgId && (
        <div className="border-t border-border pt-6">
          <WarehousesGrid orgId={orgId} />
        </div>
      )}

      {orgId && <WarehouseMap orgId={orgId} />}

      <div className="border-t border-border pt-6">
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="text-sm font-medium text-fg-muted hover:text-fg"
        >
          {showArchived ? "Hide archived stores" : "Show archived stores"}
        </button>

        {showArchived && (
          <div className="mt-4">
            {archivedLoading && (
              <div className="flex justify-center py-6">
                <Spinner size={20} />
              </div>
            )}

            {archivedError && (
              <p className="text-sm text-red-500">
                Couldn&apos;t load archived stores.
              </p>
            )}

            {!archivedLoading &&
              !archivedError &&
              (archivedStores?.length ?? 0) === 0 && (
                <p className="text-sm text-fg-muted">No archived stores.</p>
              )}

            {!archivedLoading &&
              !archivedError &&
              (archivedStores?.length ?? 0) > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {archivedStores!.map((store) => (
                    <div
                      key={store.id}
                      className="flex flex-col justify-between rounded-2xl border border-dashed border-border bg-surface p-5 opacity-75"
                    >
                      <div>
                        <h3 className="text-base font-medium text-fg">
                          {store.name}
                        </h3>
                        {store.store_code && (
                          <p className="mt-1 text-sm text-fg-muted">
                            Code: {store.store_code}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-fg-muted">
                          Archived{" "}
                          {new Date(store.deleted_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="mt-4 flex justify-end border-t border-border pt-4">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigate(`/org/${orgId}/stores/${store.id}/edit`)
                          }
                        >
                          View / Restore
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

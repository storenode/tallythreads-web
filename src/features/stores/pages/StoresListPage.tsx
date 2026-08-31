import { useNavigate, useParams } from "react-router-dom";
import { PageHeading } from "@/components/ui/PageHeading";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useStoresByOrg } from "../stores";

export default function StoresListPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { data: stores, isLoading, isError } = useStoresByOrg(orgId);

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <Button size="sm" onClick={() => navigate(`/org/${orgId}/stores/new`)}>
            New store
          </Button>
        }
      >
        Stores
      </PageHeading>

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
    </div>
  );
}

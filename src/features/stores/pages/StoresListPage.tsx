import { useParams } from "react-router-dom";
import { PageHeading } from "@/components/ui/PageHeading";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { useStoresByOrg } from "../stores";

export default function StoresListPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data: stores, isLoading, isError } = useStoresByOrg(orgId);

  return (
    <div className="space-y-6">
      <PageHeading>Stores</PageHeading>

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
            <Card
              key={store.id}
              title={store.name}
              desc={store.store_code ? `Code: ${store.store_code}` : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

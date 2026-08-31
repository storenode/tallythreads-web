import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { PageHeading } from "@/components/ui/PageHeading";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { useLoadingGate } from "@/hooks/useLoadingGate";
import { useCreateStore } from "../storesAdmin";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

const createStoreSchema = z.object({
  name: z.string().trim().min(1, "Store name is required"),
  store_code: z.string(),
});

type CreateStoreValues = z.infer<typeof createStoreSchema>;

// Deliberately minimal — name + code only (2026-08-30 scoping decision to keep
// store creation minimal and invite staff afterward, from the store edit page's
// Members grid, rather than bundling invites into creation the way organization
// creation does).
export default function StoreCreatePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const listTo = `/org/${orgId}/stores`;
  const createStore = useCreateStore(orgId);
  const { isLoading, withLoading } = useLoadingGate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateStoreValues>({
    resolver: zodResolver(createStoreSchema) as Resolver<CreateStoreValues>,
    defaultValues: { name: "", store_code: "" },
  });

  if (!orgId) return null;

  const onSubmit = (values: CreateStoreValues) =>
    withLoading(async () => {
      setServerError(null);
      try {
        const store = await createStore.mutateAsync(values);
        navigate(`/org/${orgId}/stores/${store.id}/edit`);
      } catch (err) {
        setServerError(errorMessage(err, "Couldn't create the store."));
      }
    });

  return (
    <div className="space-y-6">
      <LoadingOverlay show={isLoading} scope="page" label="Creating store…" />

      <PageHeading
        action={
          <Link
            to={listTo}
            className="text-sm font-medium text-fg-muted hover:text-fg"
          >
            ← Back
          </Link>
        }
      >
        New store
      </PageHeading>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card title="Store">
          <div className="space-y-4">
            <Input
              label="Store name"
              placeholder="Anna Nagar Branch"
              error={errors.name?.message}
              {...register("name")}
            />
            <Input
              label="Store code"
              placeholder="ANR-01"
              error={errors.store_code?.message}
              {...register("store_code")}
            />
          </div>
        </Card>

        {serverError && <p className="text-sm text-red-500">{serverError}</p>}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(listTo)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Creating…" : "Create store"}
          </Button>
        </div>
      </form>
    </div>
  );
}

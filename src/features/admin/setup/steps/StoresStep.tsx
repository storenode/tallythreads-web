import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormProvider, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { StoreDetailsFields } from "@/features/stores/StoreDetailsFields";
import { useStoresByOrg } from "@/features/stores/stores";
import {
  useCreateStore,
  useStore,
  useUpdateStore,
} from "@/features/stores/storesAdmin";
import { useSetupNav, useSetupOrg } from "../SetupWizardLayout";
import { SetupStepFooter } from "./SetupStepFooter";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

const s = (v: string | null | undefined) => v ?? "";

const storeSchema = z.object({
  name: z.string().trim().min(1, "Store name is required"),
  store_code: z.string(),
  address_line1: z.string(),
  address_line2: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  country: z.string(),
  phone_number: z.string(),
  email: z.string(),
  gstin: z.string(),
  opening_time: z.string(),
  closing_time: z.string(),
});

type StoreValues = z.infer<typeof storeSchema>;

const storeDefaults: StoreValues = {
  name: "",
  store_code: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  pincode: "",
  country: "India",
  phone_number: "",
  email: "",
  gstin: "",
  opening_time: "",
  closing_time: "",
};

const TEXT_KEYS = [
  "store_code",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "pincode",
  "country",
  "phone_number",
  "email",
  "gstin",
  "opening_time",
  "closing_time",
] as const;

/**
 * Create/edit form for a single store, reused for both modes: `storeId`
 * undefined creates a new store, otherwise it pre-fills and patches the
 * existing one. Same {@link StoreDetailsFields} block, schema, and hooks as the
 * standalone store pages — only the danger-zone / members / placement extras
 * are left off here (those live on the full store edit page). Calls `onDone`
 * after a successful save and `onCancel` to return to the list without saving.
 */
function StoreForm({
  orgId,
  storeId,
  onDone,
  onCancel,
}: {
  orgId: string;
  storeId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = !!storeId;
  const { data: store, isLoading } = useStore(storeId);
  const createStore = useCreateStore(orgId);
  const updateStore = useUpdateStore();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<StoreValues>({
    resolver: zodResolver(storeSchema) as Resolver<StoreValues>,
    defaultValues: storeDefaults,
    values:
      isEdit && store
        ? {
            name: store.name,
            store_code: s(store.store_code),
            address_line1: s(store.address_line1),
            address_line2: s(store.address_line2),
            city: s(store.city),
            state: s(store.state),
            pincode: s(store.pincode),
            country: s(store.country),
            phone_number: s(store.phone_number),
            email: s(store.email),
            gstin: s(store.gstin),
            opening_time: s(store.opening_time),
            closing_time: s(store.closing_time),
          }
        : undefined,
  });
  const {
    register,
    handleSubmit,
    formState: { errors, dirtyFields, isSubmitting },
  } = form;

  if (isEdit && isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  }

  const onSubmit = (values: StoreValues) =>
    (async () => {
      setServerError(null);
      try {
        if (isEdit && storeId) {
          const patch: Record<string, string | null> = {};
          if (dirtyFields.name) patch.name = values.name.trim();
          for (const key of TEXT_KEYS) {
            if (dirtyFields[key]) patch[key] = values[key].trim() || null;
          }
          if (Object.keys(patch).length > 0) {
            await updateStore.mutateAsync({ id: storeId, patch });
          }
        } else {
          await createStore.mutateAsync(values);
        }
        onDone();
      } catch (err) {
        setServerError(
          errorMessage(
            err,
            isEdit ? "Couldn't save your changes." : "Couldn't create the store.",
          ),
        );
      }
    })();

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card title={isEdit ? "Edit store" : "New store"}>
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
              {...register("store_code")}
            />
          </div>
        </Card>

        <Card
          title="Store details"
          desc="Address, contact, GST, and business hours. Optional."
        >
          <StoreDetailsFields />
        </Card>

        {serverError && <p className="text-sm text-red-500">{serverError}</p>}

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : "Add store"}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}

type StoresView =
  | { mode: "list" }
  | { mode: "create" }
  | { mode: "edit"; storeId: string };

/**
 * Wizard step 2: a single-pane store manager. The list of stores and the
 * create/edit form never show at once — "Add store" swaps the list for a blank
 * form, clicking a store name swaps it for that store's edit form, and Cancel
 * (or a successful save) returns to the list.
 */
export default function StoresStep() {
  const { org } = useSetupOrg();
  const { stepPath } = useSetupNav();
  const navigate = useNavigate();
  const { data: stores, isLoading, isError } = useStoresByOrg(org.id);
  const [view, setView] = useState<StoresView>({ mode: "list" });

  const backToList = () => setView({ mode: "list" });

  if (view.mode !== "list") {
    return (
      <StoreForm
        orgId={org.id}
        storeId={view.mode === "edit" ? view.storeId : undefined}
        onDone={backToList}
        onCancel={backToList}
      />
    );
  }

  const storeCount = stores?.length ?? 0;

  return (
    <div className="space-y-6">
      <Card
        title="Stores"
        desc="Add every branch this organization runs. Click a store to edit it."
        actions={
          <Button size="sm" onClick={() => setView({ mode: "create" })}>
            Add store
          </Button>
        }
      >
        {isLoading && (
          <div className="flex justify-center py-6">
            <Spinner size={20} />
          </div>
        )}
        {isError && (
          <p className="text-sm text-red-500">Couldn&apos;t load stores.</p>
        )}
        {!isLoading && !isError && storeCount === 0 && (
          <p className="text-sm text-fg-muted">
            No stores yet — add your first branch to continue.
          </p>
        )}
        {!isLoading && storeCount > 0 && (
          <ul className="space-y-2">
            {stores!.map((store) => (
              <li
                key={store.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <button
                  type="button"
                  onClick={() => setView({ mode: "edit", storeId: store.id })}
                  className="group flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="truncate text-sm font-medium text-fg group-hover:text-tt-green-600">
                    {store.name}
                  </span>
                  {store.store_code && (
                    <span className="text-xs text-fg-muted">
                      {store.store_code}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`${stepPath("stock-setup")}?store=${store.id}`)
                  }
                  className="shrink-0 text-sm font-medium text-tt-green-600 hover:underline"
                >
                  Stock setup →
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SetupStepFooter
        back="organization"
        next="stock-setup"
        nextLabel={storeCount > 0 ? "Next: Stock setup →" : "Skip →"}
      />
    </div>
  );
}

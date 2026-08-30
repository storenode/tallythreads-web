import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/Input";
import { SingleSelect } from "@/components/ui/SingleSelect";
import type { RegistrationType } from "./organizations";

/**
 * The three "core" org fields shared by the create and edit pages. These are
 * directly editable on both — no approval workflow. Do NOT conflate
 * `registration_type` with the derived `store_business_model` view; they are
 * unrelated concepts.
 */
export interface OrganizationCoreFormValues {
  name: string;
  registration_type: RegistrationType;
  is_demo: boolean;
}

const REGISTRATION_TYPE_OPTIONS: { value: RegistrationType; label: string }[] = [
  { value: "independent", label: "Independent" },
  { value: "chain", label: "Chain" },
  { value: "franchise", label: "Franchise" },
];

/**
 * Renders the name / registration_type / is_demo fields against the surrounding
 * React Hook Form context. Both parent forms include these values in their Zod
 * schema, keyed exactly as {@link OrganizationCoreFormValues}.
 */
export function OrganizationCoreFields() {
  const {
    register,
    formState: { errors },
  } = useFormContext<OrganizationCoreFormValues>();

  return (
    <div className="space-y-4">
      <Input
        label="Organization name"
        placeholder="Acme Retail Pvt Ltd"
        error={errors.name?.message}
        {...register("name")}
      />

      <SingleSelect
        label="Registration type"
        placeholder="Select registration type"
        options={REGISTRATION_TYPE_OPTIONS}
        error={Boolean(errors.registration_type)}
        hint={errors.registration_type?.message}
        {...register("registration_type")}
      />

      <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          className="size-4 cursor-pointer rounded border-border accent-tt-green-500"
          {...register("is_demo")}
        />
        Demo organization
      </label>
    </div>
  );
}

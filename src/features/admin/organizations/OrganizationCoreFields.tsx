import { useEffect, useRef } from "react";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/Input";
import { SingleSelect } from "@/components/ui/SingleSelect";
import type { RegistrationType } from "./organizations";
import { suggestOrgCode } from "@/features/inventory/codes";

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
  /** Short org code (BND) — prefix of unallocated-stock SKUs. "" = not set. */
  org_code: string;
}

const REGISTRATION_TYPE_OPTIONS: { value: RegistrationType; label: string }[] = [
  { value: "independent", label: "Independent" },
  { value: "chain", label: "Chain" },
  { value: "franchise", label: "Franchise" },
];

/**
 * Renders the name / short code / registration_type / is_demo fields against the
 * surrounding React Hook Form context. Both parent forms include these values in
 * their Zod schema, keyed exactly as {@link OrganizationCoreFormValues}.
 *
 * The short code is suggested from the name (and the org's store codes, when it
 * has stores) until the user types one — see suggestOrgCode().
 */
export function OrganizationCoreFields({
  storeCodes = [],
}: {
  /** The org's existing store codes (edit mode), used to suggest the short code. */
  storeCodes?: (string | null)[];
} = {}) {
  const {
    register,
    watch,
    setValue,
    getValues,
    getFieldState,
    formState: { errors },
  } = useFormContext<OrganizationCoreFormValues>();

  // Keep suggesting while the field holds nothing or our own last suggestion — never
  // overwrite a code the user typed or one already saved.
  const name = watch("name");
  const storeCodesKey = storeCodes.join("|");
  const lastSuggested = useRef<string | null>(null);
  useEffect(() => {
    const current = getValues("org_code") ?? "";
    if (getFieldState("org_code").isDirty) return;
    if (current !== "" && current !== lastSuggested.current) return;
    const next = suggestOrgCode(name ?? "", storeCodes);
    lastSuggested.current = next;
    if (next !== current) setValue("org_code", next, { shouldDirty: false });
    // storeCodes is compared via storeCodesKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, storeCodesKey]);

  return (
    <div className="space-y-4">
      <Input
        label="Organization name"
        placeholder="Acme Retail Pvt Ltd"
        error={errors.name?.message}
        {...register("name")}
      />

      <Input
        label="Short code"
        placeholder="BND"
        className="uppercase"
        maxLength={6}
        autoCapitalize="characters"
        error={errors.org_code?.message}
        hint={
          errors.org_code?.message
            ? undefined
            : "2–6 letters/numbers. Used in barcodes for stock not yet sent to a store (e.g. BND-UNA-…)."
        }
        {...register("org_code")}
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

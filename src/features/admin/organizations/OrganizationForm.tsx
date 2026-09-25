import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  FormProvider,
  useForm,
  useFormContext,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { useLoadingGate } from "@/hooks/useLoadingGate";
import { LogoUpload } from "@/components/ui/LogoUpload";
import { OrganizationCoreFields } from "./OrganizationCoreFields";
import {
  useCreateOrganization,
  useOrganizationMembers,
  useRevokeOrganizationMember,
  useUpdateOrganization,
  useRemoveOrganizationLogo,
  useUploadOrganizationLogo,
  type LegalEntityType,
  type Organization,
  type RegistrationType,
  type UpdateOrganizationInput,
} from "./organizations";

const INVITE_ROLE_OPTIONS = [
  { value: "org_owner", label: "Owner" },
  { value: "org_manager", label: "Manager" },
  { value: "org_accountant", label: "Accountant" },
] as const;

const ORG_ROLE_LABELS: Record<string, string> = Object.fromEntries(
  INVITE_ROLE_OPTIONS.map((o) => [o.value, o.label]),
);

const LEGAL_ENTITY_OPTIONS: { value: LegalEntityType; label: string }[] = [
  { value: "proprietorship", label: "Proprietorship" },
  { value: "partnership", label: "Partnership" },
  { value: "llp", label: "LLP" },
  { value: "private_limited", label: "Private Limited" },
  { value: "huf", label: "HUF" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "trial", label: "Trial" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "churned", label: "Churned" },
] as const;

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

// Registration-detail fields, shared by Create (all optional there — none of
// these gate anything) and Edit, so both validate and patch identically.
const registrationDetailsSchema = z.object({
  legal_name: z.string(),
  legal_entity_type: z.string(),
  gstin: z.string(),
  pan: z.string(),
  address_line1: z.string(),
  address_line2: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  country: z.string(),
  website: z.string(),
  financial_year_start_month: z
    .string()
    .refine(
      (v) => v === "" || (/^\d+$/.test(v) && +v >= 1 && +v <= 12),
      "Enter a month number from 1 to 12",
    ),
  preferred_language: z.string(),
  status: z.enum(["trial", "active", "suspended", "churned"]),
  notes: z.string(),
});

type RegistrationDetailsValues = z.infer<typeof registrationDetailsSchema>;

const registrationDetailsDefaults: RegistrationDetailsValues = {
  legal_name: "",
  legal_entity_type: "",
  gstin: "",
  pan: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  pincode: "",
  country: "",
  website: "",
  financial_year_start_month: "",
  preferred_language: "",
  status: "active",
  notes: "",
};

const REG_TEXT_FIELDS: {
  name: keyof RegistrationDetailsValues;
  label: string;
  type?: string;
}[] = [
  { name: "legal_name", label: "Legal name" },
  { name: "gstin", label: "GSTIN" },
  { name: "pan", label: "PAN" },
  { name: "address_line1", label: "Address line 1" },
  { name: "address_line2", label: "Address line 2" },
  { name: "city", label: "City" },
  { name: "state", label: "State" },
  { name: "pincode", label: "Pincode" },
  { name: "country", label: "Country" },
  { name: "website", label: "Website", type: "url" },
  { name: "preferred_language", label: "Preferred language" },
];

const NULLABLE_TEXT_KEYS = [
  "legal_name",
  "gstin",
  "pan",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "pincode",
  "country",
  "website",
  "preferred_language",
  "notes",
] as const;

function RegistrationDetailsFields() {
  const {
    register,
    formState: { errors },
  } = useFormContext<RegistrationDetailsValues>();

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {REG_TEXT_FIELDS.map((f) => (
          <Input
            key={f.name}
            label={f.label}
            type={f.type ?? "text"}
            error={errors[f.name]?.message as string | undefined}
            {...register(f.name)}
          />
        ))}

        <SingleSelect
          label="Legal entity type"
          placeholder="Not set"
          options={LEGAL_ENTITY_OPTIONS.map((o) => ({ ...o }))}
          {...register("legal_entity_type")}
        />

        <Input
          label="Financial year start month (1–12)"
          type="number"
          min={1}
          max={12}
          error={errors.financial_year_start_month?.message}
          {...register("financial_year_start_month")}
        />

        <SingleSelect
          label="Status"
          placeholder={null}
          options={STATUS_OPTIONS.map((o) => ({ ...o }))}
          {...register("status")}
        />
      </div>

      <Textarea label="Notes" {...register("notes")} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

// Create takes only the org's own fields now — no owner/primary-contact invites.
// People are added (and mandated) later at the wizard's Members step, before an
// org can go live. The RPC accepts an empty invites array, so no DB change.
const createSchema = z
  .object({
    name: z.string().trim().min(1, "Organization name is required"),
    registration_type: z.enum(["independent", "chain", "franchise"]),
    is_demo: z.boolean(),
  })
  .merge(registrationDetailsSchema);

type CreateFormValues = z.infer<typeof createSchema>;

/**
 * The organization-create form body (core + registration cards and the
 * Cancel / submit footer), without any page chrome. On success it calls
 * `onCreated` with the new org and any non-fatal registration-details patch
 * warning (the org already exists by then, so a patch failure never blocks the
 * caller). Owner/primary-contact are set later at the Members step.
 */
export function OrganizationCreateForm({
  onCreated,
  onCancel,
  submitLabel = "Create organization",
}: {
  onCreated: (org: Organization, warning: string | null) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const createOrg = useCreateOrganization();
  const updateOrg = useUpdateOrganization();
  const { isLoading, withLoading } = useLoadingGate();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema) as Resolver<CreateFormValues>,
    defaultValues: {
      name: "",
      registration_type: "" as RegistrationType,
      is_demo: false,
      ...registrationDetailsDefaults,
    },
  });
  const {
    handleSubmit,
  } = form;

  const onSubmit = (values: CreateFormValues) =>
    withLoading(async () => {
      setServerError(null);

      let org: Organization;
      try {
        org = await createOrg.mutateAsync({
          name: values.name.trim(),
          registration_type: values.registration_type,
          is_demo: values.is_demo,
          // No invites at creation — owner/primary contact added at Members step.
          invites: [],
        });
      } catch (err) {
        setServerError(errorMessage(err, "Couldn't create the organization."));
        return;
      }

      // Registration details aren't part of provision_organization_with_contacts()'s
      // transaction — this is a plain follow-up update, same mechanism as editing
      // them later. Only send fields actually filled in; nothing here blocks
      // navigation, since the org (and any invites) already exist either way.
      const patch: UpdateOrganizationInput = {};
      if (values.legal_entity_type)
        patch.legal_entity_type = values.legal_entity_type as LegalEntityType;
      if (values.financial_year_start_month)
        patch.financial_year_start_month = Number(
          values.financial_year_start_month,
        );
      if (values.status !== "active") patch.status = values.status;
      for (const key of NULLABLE_TEXT_KEYS) {
        const trimmed = values[key].trim();
        if (trimmed) patch[key] = trimmed;
      }

      // The org (and any invites) already exist either way, so a failure here
      // never blocks navigation — but it must not be swallowed silently either.
      // Carry it as router state so the list page can surface what happened.
      let patchWarning: string | null = null;
      if (Object.keys(patch).length > 0) {
        try {
          await updateOrg.mutateAsync({ id: org.id, patch });
        } catch (err) {
          patchWarning = errorMessage(
            err,
            "Organization was created, but the registration details couldn't be saved. Open the organization to try again.",
          );
        }
      }

      onCreated(org, patchWarning);
    });

  return (
    <>
      <LoadingOverlay
        show={isLoading}
        scope="page"
        label="Creating organization…"
      />

      <FormProvider {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card title="Organization">
            <OrganizationCoreFields />
          </Card>

          <Card
            title="Registration details"
            desc="Optional — you can also fill these in later from the edit page."
          >
            <RegistrationDetailsFields />
          </Card>

          {serverError && <p className="text-sm text-red-500">{serverError}</p>}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating…" : submitLabel}
            </Button>
          </div>
        </form>
      </FormProvider>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Edit                                                                */
/* ------------------------------------------------------------------ */

const editSchema = z
  .object({
    name: z.string().trim().min(1, "Organization name is required"),
    // Unlike Create (where this is a required enum — every new org declares its
    // type up front), Edit has to tolerate an unset value: the DB column is
    // nullable, and zodResolver validates the WHOLE form on every submit, not
    // just dirty fields — a strict enum here would silently block saving ANY
    // other field on an org whose registration_type is null. Same "" = unset
    // pattern already used for legal_entity_type below.
    registration_type: z.string(),
    is_demo: z.boolean(),
  })
  .merge(registrationDetailsSchema);

type EditFormValues = z.infer<typeof editSchema>;

const s = (v: string | null | undefined) => v ?? "";

function toDefaults(org: Organization): EditFormValues {
  return {
    name: org.name,
    registration_type: s(org.registration_type),
    is_demo: org.is_demo,
    legal_name: s(org.legal_name),
    legal_entity_type: s(org.legal_entity_type),
    gstin: s(org.gstin),
    pan: s(org.pan),
    address_line1: s(org.address_line1),
    address_line2: s(org.address_line2),
    city: s(org.city),
    state: s(org.state),
    pincode: s(org.pincode),
    country: s(org.country),
    website: s(org.website),
    financial_year_start_month:
      org.financial_year_start_month != null
        ? String(org.financial_year_start_month)
        : "",
    preferred_language: s(org.preferred_language),
    status: org.status,
    notes: s(org.notes),
  };
}

export function MembersCard({ org }: { org: Organization }) {
  const navigate = useNavigate();
  const { data: members, isLoading, isError } = useOrganizationMembers(org.id);
  const revokeMember = useRevokeOrganizationMember(org.id);
  const updateOrg = useUpdateOrganization();

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Per-row primary-contact selection, saved individually (it writes to the
  // organizations row, not memberships). Kept in sync whenever the saved value
  // changes — including right after our own save.
  const [primaryDraft, setPrimaryDraft] = useState<string | null>(
    org.primary_contact_member_id,
  );
  const [primaryError, setPrimaryError] = useState<string | null>(null);
  useEffect(() => {
    setPrimaryDraft(org.primary_contact_member_id);
  }, [org.primary_contact_member_id]);
  const primaryDirty = primaryDraft !== org.primary_contact_member_id;

  const savePrimaryContact = async (memberId: string | null) => {
    setPrimaryError(null);
    try {
      await updateOrg.mutateAsync({
        id: org.id,
        patch: { primary_contact_member_id: memberId },
      });
    } catch (err) {
      setPrimaryError(
        errorMessage(err, "Couldn't update the primary contact."),
      );
    }
  };

  const handleRevoke = async (membershipId: string) => {
    setRevokeError(null);
    try {
      await revokeMember.mutateAsync(membershipId);
      setConfirmingId(null);
    } catch (err) {
      setRevokeError(errorMessage(err, "Couldn't remove this member."));
    }
  };

  return (
    <Card
      title="Members"
      desc="Everyone with access to this organization."
      actions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/org/${org.id}/members/new`)}
        >
          Add member
        </Button>
      }
    >
      {isLoading && (
        <div className="flex justify-center py-6">
          <Spinner size={20} />
        </div>
      )}
      {isError && (
        <p className="text-sm text-red-500">Couldn&apos;t load members.</p>
      )}

      {!isLoading && !isError && (members?.length ?? 0) === 0 && (
        <p className="text-sm text-fg-muted">No members yet.</p>
      )}

      {!isLoading && !isError && (members?.length ?? 0) > 0 && (
        <div className="space-y-2">
          {members!.map((m) => {
            const name = [m.firstName, m.lastName].filter(Boolean).join(" ");
            const isPrimary = m.memberId === org.primary_contact_member_id;
            return (
              <div
                key={m.membershipId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <Link
                  to={`/org/${org.id}/members/${m.memberId}/edit`}
                  className="group"
                >
                  <p className="text-sm font-medium text-fg group-hover:text-tt-green-600 group-hover:underline">
                    {name || m.email}
                    {isPrimary && (
                      <span className="ml-2 text-xs font-medium text-tt-lavender-600">
                        ★ Primary
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-fg-muted group-hover:text-tt-green-600 group-hover:underline">
                    {m.email}
                  </p>
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-fg-muted">
                    {ORG_ROLE_LABELS[m.roleName] ?? m.roleName}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                      m.isActive
                        ? "border-border text-fg-muted"
                        : "border-tt-lavender-500/40 text-tt-lavender-600"
                    }`}
                  >
                    {m.isActive ? "Active" : "Invited"}
                  </span>

                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-fg-muted">
                    <input
                      type="radio"
                      name={`primary-contact-${org.id}`}
                      className="size-4 cursor-pointer accent-tt-green-500"
                      checked={primaryDraft === m.memberId}
                      onChange={() => setPrimaryDraft(m.memberId)}
                      disabled={updateOrg.isPending}
                    />
                    Primary contact
                  </label>

                  {primaryDirty && primaryDraft === m.memberId && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => savePrimaryContact(m.memberId)}
                        disabled={updateOrg.isPending}
                      >
                        {updateOrg.isPending ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setPrimaryDraft(org.primary_contact_member_id)
                        }
                        disabled={updateOrg.isPending}
                      >
                        Undo
                      </Button>
                    </>
                  )}

                  {confirmingId === m.membershipId ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        className="bg-red-500 hover:enabled:bg-red-600"
                        onClick={() => handleRevoke(m.membershipId)}
                        disabled={revokeMember.isPending}
                      >
                        {revokeMember.isPending ? "Removing…" : "Confirm"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="border-red-500/50 text-red-500 hover:enabled:bg-red-500/10"
                      onClick={() => setConfirmingId(m.membershipId)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {org.primary_contact_member_id && !primaryDirty && (
        <button
          type="button"
          onClick={() => savePrimaryContact(null)}
          disabled={updateOrg.isPending}
          className="mt-3 text-xs font-medium text-fg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-60"
        >
          Remove primary contact
        </button>
      )}
      {primaryError && (
        <p className="mt-2 text-sm text-red-500">{primaryError}</p>
      )}
      {revokeError && (
        <p className="mt-2 text-sm text-red-500">{revokeError}</p>
      )}
    </Card>
  );
}

/**
 * The organization edit form itself — core + registration cards, logo, and the
 * Save / Cancel row. Self-contained (owns its useForm, patch-building and
 * submit); `doneTo` is where Cancel and a successful save navigate. Shared by
 * the admin console edit page and the org self-service page under /org.
 */
export function OrganizationEditFormCard({
  org,
  orgId,
  doneTo,
  submitLabel = "Save changes",
  hideCancel = false,
}: {
  org: Organization;
  orgId: string;
  doneTo: string;
  /** Label for the primary submit button (e.g. "Next: Save changes" in the
   * setup wizard, where saving also advances a step). */
  submitLabel?: string;
  /** Hide the Cancel button — used where an outer back/exit control already
   * covers cancelling (e.g. the wizard's "← Dashboard"). */
  hideCancel?: boolean;
}) {
  const navigate = useNavigate();
  const updateOrg = useUpdateOrganization();
  const uploadLogo = useUploadOrganizationLogo();
  const removeLogo = useRemoveOrganizationLogo();
  const { isLoading, withLoading } = useLoadingGate();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema) as Resolver<EditFormValues>,
    defaultValues: toDefaults(org),
  });
  const {
    handleSubmit,
    formState: { dirtyFields },
  } = form;

  const onSubmit = (values: EditFormValues) =>
    withLoading(async () => {
      setServerError(null);

      const patch: UpdateOrganizationInput = {};
      if (dirtyFields.name) patch.name = values.name.trim();
      if (dirtyFields.registration_type)
        patch.registration_type =
          values.registration_type === ""
            ? null
            : (values.registration_type as RegistrationType);
      if (dirtyFields.is_demo) patch.is_demo = values.is_demo;
      if (dirtyFields.status) patch.status = values.status;
      if (dirtyFields.legal_entity_type)
        patch.legal_entity_type =
          values.legal_entity_type === ""
            ? null
            : (values.legal_entity_type as LegalEntityType);
      if (dirtyFields.financial_year_start_month)
        patch.financial_year_start_month =
          values.financial_year_start_month === ""
            ? null
            : Number(values.financial_year_start_month);
      for (const key of NULLABLE_TEXT_KEYS) {
        if (dirtyFields[key]) {
          const trimmed = values[key].trim();
          patch[key] = trimmed === "" ? null : trimmed;
        }
      }

      if (Object.keys(patch).length === 0) {
        // Nothing changed in the form (a logo swap isn't a form field) — just
        // return rather than leaving the user stuck on the page.
        navigate(doneTo);
        return;
      }

      try {
        await updateOrg.mutateAsync({ id: orgId, patch });
        navigate(doneTo);
      } catch (err) {
        setServerError(errorMessage(err, "Couldn't save your changes."));
      }
    });

  return (
    <>
      <LoadingOverlay show={isLoading} scope="page" label="Saving…" />

      <FormProvider {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card title="Organization">
            <OrganizationCoreFields />
          </Card>

          <Card title="Registration details">
            <LogoUpload
              value={org.logo_url}
              disabled={isLoading}
              onUpload={(file) => uploadLogo.mutateAsync({ orgId, file })}
              onRemove={() => removeLogo.mutateAsync(orgId)}
            />
            <RegistrationDetailsFields />
          </Card>

          {serverError && <p className="text-sm text-red-500">{serverError}</p>}

          <div className="flex justify-end gap-3">
            {!hideCancel && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate(doneTo)}
                disabled={isLoading}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving…" : submitLabel}
            </Button>
          </div>
        </form>
      </FormProvider>
    </>
  );
}

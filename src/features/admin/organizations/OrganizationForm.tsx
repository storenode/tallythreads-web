import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  FormProvider,
  useFieldArray,
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
import { PageHeading } from "@/components/ui/PageHeading";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { useLoadingGate } from "@/hooks/useLoadingGate";
import { LogoUpload } from "@/components/ui/LogoUpload";
import { OrganizationCoreFields } from "./OrganizationCoreFields";
import { FranchiseCard } from "../franchises/FranchiseCard";
import {
  useArchiveOrganization,
  useCreateOrganization,
  useOrganization,
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

const LIST_PATH = "/admin/organizations";

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
  primary_contact_phone: z.string(),
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
  primary_contact_phone: "",
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
  { name: "primary_contact_phone", label: "Primary contact phone" },
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
  "primary_contact_phone",
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

const MAX_INVITES = 3;

const createSchema = z
  .object({
    name: z.string().trim().min(1, "Organization name is required"),
    registration_type: z.enum(["independent", "chain", "franchise"]),
    is_demo: z.boolean(),
    invites: z
      .array(
        z.object({
          email: z.string().trim(),
          role_name: z.enum(["org_owner", "org_manager", "org_accountant"]),
          is_primary_contact: z.boolean(),
        }),
      )
      .max(MAX_INVITES),
  })
  .merge(registrationDetailsSchema)
  .superRefine((val, ctx) => {
    val.invites.forEach((row, i) => {
      if (row.email && !z.string().email().safeParse(row.email).success) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid email address",
          path: ["invites", i, "email"],
        });
      }
    });

    // Every organization must be created with an admin: at least one invited
    // person, exactly one of them marked primary contact, and that person must
    // hold the Owner role.
    const filled = val.invites.filter((r) => r.email.trim());
    if (filled.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Add at least one invite — the organization needs a primary contact (Owner).",
        path: ["invites", 0, "email"],
      });
      return;
    }
    const primaries = filled.filter((r) => r.is_primary_contact);
    if (primaries.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Mark one invite as the primary contact.",
        path: ["invites"],
      });
    } else if (primaries.length > 1) {
      ctx.addIssue({
        code: "custom",
        message: "Only one invite can be the primary contact.",
        path: ["invites"],
      });
    } else if (primaries[0].role_name !== "org_owner") {
      ctx.addIssue({
        code: "custom",
        message: "The primary contact must have the Owner role.",
        path: ["invites"],
      });
    }
  });

type CreateFormValues = z.infer<typeof createSchema>;

const emptyInviteRow = (): CreateFormValues["invites"][number] => ({
  email: "",
  role_name: "org_owner",
  is_primary_contact: false,
});

export default function OrganizationCreatePage() {
  const navigate = useNavigate();
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
      // Seed one Owner row already marked primary — every org needs an admin.
      invites: [{ ...emptyInviteRow(), is_primary_contact: true }],
      ...registrationDetailsDefaults,
    },
  });
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "invites",
  });
  const watchedInvites = watch("invites");

  // superRefine attaches the "needs an Owner primary contact" issues at the
  // `invites` array root; RHF surfaces that as either `.message` or `.root.message`.
  const invitesErrorNode = errors.invites as
    | { message?: string; root?: { message?: string } }
    | undefined;
  const invitesError =
    invitesErrorNode?.message ?? invitesErrorNode?.root?.message;

  // Radio-like: checking one primary-contact box clears the others.
  function setPrimary(index: number, checked: boolean) {
    fields.forEach((_, i) => {
      setValue(`invites.${i}.is_primary_contact`, checked && i === index, {
        shouldDirty: true,
      });
    });
  }

  const onSubmit = (values: CreateFormValues) =>
    withLoading(async () => {
      setServerError(null);
      const invites = values.invites
        .filter((row) => row.email.trim())
        .map((row) => ({
          email: row.email.trim(),
          role_name: row.role_name,
          is_primary_contact: row.is_primary_contact,
        }));

      let org: Organization;
      try {
        org = await createOrg.mutateAsync({
          name: values.name.trim(),
          registration_type: values.registration_type,
          is_demo: values.is_demo,
          invites,
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

      navigate(
        LIST_PATH,
        patchWarning ? { state: { warning: patchWarning } } : undefined,
      );
    });

  return (
    <div className="space-y-6">
      <LoadingOverlay
        show={isLoading}
        scope="page"
        label="Creating organization…"
      />

      <PageHeading
        action={
          <Button variant="ghost" size="sm" onClick={() => navigate(LIST_PATH)}>
            Cancel
          </Button>
        }
      >
        New organization
      </PageHeading>

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

          <Card
            title="Invites"
            desc="Invite up to 3 people. Exactly one must be the primary contact, and that person must have the Owner role."
            actions={
              fields.length < MAX_INVITES ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => append(emptyInviteRow())}
                >
                  Add invite
                </Button>
              ) : null
            }
          >
            {fields.length === 0 && (
              <p className="text-sm text-fg-muted">No invites.</p>
            )}

            {fields.map((field, i) => (
              <div
                key={field.id}
                className="space-y-3 rounded-xl border border-border p-4"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Email"
                    type="email"
                    placeholder="person@example.com"
                    error={errors.invites?.[i]?.email?.message}
                    {...register(`invites.${i}.email`)}
                  />
                  <SingleSelect
                    label="Role"
                    placeholder={null}
                    options={INVITE_ROLE_OPTIONS.map((o) => ({ ...o }))}
                    {...register(`invites.${i}.role_name`)}
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
                    <input
                      type="checkbox"
                      className="size-4 cursor-pointer rounded border-border accent-tt-green-500"
                      checked={watchedInvites?.[i]?.is_primary_contact ?? false}
                      onChange={(e) => setPrimary(i, e.target.checked)}
                    />
                    Primary contact
                  </label>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(i)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}

            {invitesError && (
              <p className="text-sm text-red-500">{invitesError}</p>
            )}
          </Card>

          {serverError && <p className="text-sm text-red-500">{serverError}</p>}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(LIST_PATH)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating…" : "Create organization"}
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
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
    primary_contact_phone: s(org.primary_contact_phone),
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

export function OrganizationEditPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data: org, isLoading, isError } = useOrganization(orgId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} />
      </div>
    );
  }

  if (isError || !org || !orgId) {
    return (
      <div className="space-y-4">
        <PageHeading>Organization not found</PageHeading>
        <p className="text-sm text-fg-muted">
          This organization doesn&apos;t exist or couldn&apos;t be loaded.
        </p>
        <Link to={LIST_PATH} className="text-sm font-medium text-tt-green-600">
          ← Back to organizations
        </Link>
      </div>
    );
  }

  return <EditForm org={org} orgId={orgId} />;
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
}: {
  org: Organization;
  orgId: string;
  doneTo: string;
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
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate(doneTo)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </FormProvider>
    </>
  );
}

function EditForm({ org, orgId }: { org: Organization; orgId: string }) {
  const navigate = useNavigate();
  const archiveOrg = useArchiveOrganization();
  const { isLoading, withLoading } = useLoadingGate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleArchive = () =>
    withLoading(async () => {
      setServerError(null);
      try {
        await archiveOrg.mutateAsync(orgId);
        navigate(LIST_PATH);
      } catch (err) {
        setConfirmOpen(false);
        setServerError(errorMessage(err, "Couldn't archive the organization."));
      }
    });

  return (
    <div className="space-y-6">
      <LoadingOverlay show={isLoading} scope="page" label="Archiving…" />

      <PageHeading
        action={
          <Link
            to={LIST_PATH}
            className="text-sm font-medium text-fg-muted hover:text-fg"
          >
            ← Back
          </Link>
        }
      >
        {org.name}
      </PageHeading>

      {!org.primary_contact_member_id && (
        <p className="rounded-lg border border-warning-text/40 bg-warning-bg px-3 py-2 text-sm text-warning-text">
          This organization has no primary contact. Assign one from the Members
          section below.
        </p>
      )}

      <OrganizationEditFormCard org={org} orgId={orgId} doneTo={LIST_PATH} />

      <MembersCard org={org} />

      <FranchiseCard org={org} />

      <Card title="Danger zone">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-fg-muted">
            Archiving hides this organization from the console. It can be
            restored later by an engineer.
          </p>
          <Button
            type="button"
            variant="ghost"
            className="border-red-500/50 text-red-500 hover:enabled:bg-red-500/10"
            onClick={() => setConfirmOpen(true)}
            disabled={isLoading}
          >
            Archive
          </Button>
        </div>
      </Card>

      {serverError && <p className="text-sm text-red-500">{serverError}</p>}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Archive organization?"
      >
        <p className="text-sm text-fg-muted">
          <span className="font-medium text-fg">{org.name}</span> will be
          soft-deleted and removed from the console.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirmOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-red-500 hover:enabled:bg-red-600"
            onClick={handleArchive}
          >
            Archive
          </Button>
        </div>
      </Modal>
    </div>
  );
}

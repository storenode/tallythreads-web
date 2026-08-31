import { useState } from "react";
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
import { SingleSelect } from "@/components/ui/SingleSelect";
import { Card } from "@/components/ui/Card";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { useLoadingGate } from "@/hooks/useLoadingGate";
import { roleDisplayName } from "@/features/admin/roles/roles";
import {
  useInviteOrganizationMember,
  useUpdateOrgMemberProfile,
} from "@/features/admin/organizations/organizations";
import {
  useInviteStoreMember,
  useUpdateStoreMemberProfile,
} from "@/features/stores/storesAdmin";
import type { MemberProfileFields } from "./types";

const ORG_ROLE_NAMES = ["org_owner", "org_manager", "org_accountant"] as const;
const STORE_ROLE_NAMES = [
  "store_manager",
  "store_sales_staff",
  "store_cleaning_staff",
  "store_temp_staff",
] as const;

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

const memberFormSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  role_name: z.string().min(1, "Select a role"),
  is_primary_contact: z.boolean(),
  first_name: z.string(),
  last_name: z.string(),
  mobile_number: z.string(),
  aadhaar_number: z.string(),
  pan_number: z.string(),
  date_of_joining: z.string(),
  emergency_contact_name: z.string(),
  emergency_contact_phone: z.string(),
  address_line1: z.string(),
  address_line2: z.string(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
});

type MemberFormValues = z.infer<typeof memberFormSchema>;

const emptyDefaults = (
  email: string,
  role: string,
  fields?: MemberProfileFields,
): MemberFormValues => ({
  email,
  role_name: role,
  is_primary_contact: false,
  first_name: fields?.firstName ?? "",
  last_name: fields?.lastName ?? "",
  mobile_number: fields?.mobileNumber ?? "",
  aadhaar_number: fields?.aadhaarNumber ?? "",
  pan_number: fields?.panNumber ?? "",
  date_of_joining: fields?.dateOfJoining ?? "",
  emergency_contact_name: fields?.emergencyContactName ?? "",
  emergency_contact_phone: fields?.emergencyContactPhone ?? "",
  address_line1: fields?.addressLine1 ?? "",
  address_line2: fields?.addressLine2 ?? "",
  city: fields?.city ?? "",
  state: fields?.state ?? "",
  pincode: fields?.pincode ?? "",
});

/** Present only when this form is editing an already-existing member (reached by
 * clicking their email in the Members list) rather than inviting a new one. Email
 * and role are read-only here — they're a different, more delicate kind of change
 * (identity key / membership swap) than the profile fields this form edits. */
export interface MemberEditContext {
  memberId: string;
  email: string;
  roleName: string;
  initialValues: MemberProfileFields;
}

interface MemberFormProps {
  /** Always required — every member, org- or store-scoped, belongs to one organization. */
  organizationId: string;
  /** When set, this is a store-scoped form: the role picker (create mode) shows
   * store roles, invite_store_member/update_member_profile(target_store_id) are the
   * RPCs used, and there's no primary-contact concept. When absent, it's org-scoped. */
  storeId?: string;
  /** Omit to invite a new member; pass to edit an existing one. */
  edit?: MemberEditContext;
  onSuccess: () => void;
  onCancel?: () => void;
}

/**
 * Shared "member" form — one component behind the org-scoped and store-scoped
 * "add member" pages (create mode) and the "edit member" pages (edit mode) reached
 * by clicking a member's email in either Members list. Captures identity/KYC
 * (Aadhaar + PAN), contact, emergency contact, employment, and address details
 * alongside the invite email + role. In create mode, person and role assignment
 * happen together in one submit (invite_organization_member / invite_store_member
 * each do both atomically server-side). In edit mode, only the profile fields are
 * writable — email and role are shown read-only, since changing either is a
 * different, separate action (see MemberEditContext).
 */
export function MemberForm({
  organizationId,
  storeId,
  edit,
  onSuccess,
  onCancel,
}: MemberFormProps) {
  const isStoreScoped = !!storeId;
  const isEditing = !!edit;
  const roleNames = isStoreScoped ? STORE_ROLE_NAMES : ORG_ROLE_NAMES;
  const roleOptions = roleNames.map((name) => ({
    value: name,
    label: roleDisplayName(name),
  }));

  // All four hooks are declared unconditionally (Rules of Hooks) — only the one
  // matching (isStoreScoped, isEditing) is ever invoked on submit. Hooks fed an
  // undefined id are safe to declare; their mutationFn is simply never called.
  const inviteOrgMember = useInviteOrganizationMember(organizationId);
  const inviteStoreMember = useInviteStoreMember(storeId);
  const updateOrgMember = useUpdateOrgMemberProfile(organizationId);
  const updateStoreMember = useUpdateStoreMemberProfile(storeId);

  const { isLoading, withLoading } = useLoadingGate();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema) as Resolver<MemberFormValues>,
    defaultValues: isEditing
      ? emptyDefaults(edit.email, edit.roleName, edit.initialValues)
      : emptyDefaults("", isStoreScoped ? STORE_ROLE_NAMES[0] : "org_manager"),
  });
  const { handleSubmit } = form;

  const onSubmit = (values: MemberFormValues) =>
    withLoading(async () => {
      setServerError(null);
      const profileFields: MemberProfileFields = {
        firstName: values.first_name,
        lastName: values.last_name,
        mobileNumber: values.mobile_number,
        aadhaarNumber: values.aadhaar_number,
        panNumber: values.pan_number,
        dateOfJoining: values.date_of_joining,
        emergencyContactName: values.emergency_contact_name,
        emergencyContactPhone: values.emergency_contact_phone,
        addressLine1: values.address_line1,
        addressLine2: values.address_line2,
        city: values.city,
        state: values.state,
        pincode: values.pincode,
      };

      try {
        if (isEditing) {
          if (isStoreScoped) {
            await updateStoreMember.mutateAsync({
              memberId: edit.memberId,
              input: profileFields,
            });
          } else {
            await updateOrgMember.mutateAsync({
              memberId: edit.memberId,
              input: profileFields,
            });
          }
        } else if (isStoreScoped) {
          await inviteStoreMember.mutateAsync({
            email: values.email,
            role_name: values.role_name,
            ...profileFields,
          });
        } else {
          await inviteOrgMember.mutateAsync({
            email: values.email,
            role_name: values.role_name as
              | "org_owner"
              | "org_manager"
              | "org_accountant",
            is_primary_contact: values.is_primary_contact,
            ...profileFields,
          });
        }
        onSuccess();
      } catch (err) {
        setServerError(
          errorMessage(
            err,
            isEditing ? "Couldn't save this member." : "Couldn't add this member.",
          ),
        );
      }
    });

  return (
    <div className="space-y-6">
      <LoadingOverlay
        show={isLoading}
        scope="page"
        label={isEditing ? "Saving…" : "Adding member…"}
      />

      <FormProvider {...form}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card
            title="Role"
            desc={isStoreScoped ? "Access to this store." : "Access to this organization."}
          >
            <MemberRoleFields
              roleOptions={roleOptions}
              showPrimaryContact={!isStoreScoped && !isEditing}
              readOnly={isEditing}
              readOnlyRoleLabel={isEditing ? roleDisplayName(edit.roleName) : undefined}
            />
          </Card>

          <Card title="Identity & contact">
            <MemberContactFields />
          </Card>

          <Card title="Employment & address" desc="Optional.">
            <MemberEmploymentFields />
          </Card>

          {serverError && <p className="text-sm text-red-500">{serverError}</p>}

          <div className="flex justify-end gap-3">
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={isLoading}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={isLoading}>
              {isEditing
                ? isLoading
                  ? "Saving…"
                  : "Save changes"
                : isLoading
                  ? "Adding…"
                  : "Add member"}
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}

function MemberRoleFields({
  roleOptions,
  showPrimaryContact,
  readOnly,
  readOnlyRoleLabel,
}: {
  roleOptions: { value: string; label: string }[];
  showPrimaryContact: boolean;
  readOnly: boolean;
  /** The current role's display label, resolved by the parent from edit.roleName —
   * passed directly rather than re-derived here because the member's actual role
   * may not even be in `roleOptions` (e.g. roleOptions lists creatable roles for
   * this scope; an edited member could in principle hold a role outside that set). */
  readOnlyRoleLabel?: string;
}) {
  const {
    register,
    formState: { errors },
  } = useFormContext<MemberFormValues>();

  return (
    <div className="space-y-4">
      <Input
        label="Email"
        type="email"
        placeholder="person@example.com"
        error={errors.email?.message}
        disabled={readOnly}
        {...register("email")}
      />
      {readOnly ? (
        <Input label="Role" value={readOnlyRoleLabel ?? ""} disabled readOnly />
      ) : (
        <SingleSelect
          label="Role"
          placeholder={null}
          options={roleOptions}
          error={Boolean(errors.role_name)}
          hint={errors.role_name?.message}
          {...register("role_name")}
        />
      )}
      {showPrimaryContact && (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            className="size-4 cursor-pointer rounded border-border accent-tt-green-500"
            {...register("is_primary_contact")}
          />
          Make primary contact
        </label>
      )}
    </div>
  );
}

function MemberContactFields() {
  const { register } = useFormContext<MemberFormValues>();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input label="First name" {...register("first_name")} />
      <Input label="Last name" {...register("last_name")} />
      <Input
        label="Mobile number"
        type="tel"
        placeholder="98765 43210"
        {...register("mobile_number")}
      />
      <Input
        label="Aadhaar number"
        placeholder="XXXX XXXX XXXX"
        {...register("aadhaar_number")}
      />
      <Input
        label="PAN number"
        placeholder="ABCDE1234F"
        {...register("pan_number")}
      />
      <Input label="Emergency contact name" {...register("emergency_contact_name")} />
      <Input
        label="Emergency contact phone"
        type="tel"
        {...register("emergency_contact_phone")}
      />
    </div>
  );
}

function MemberEmploymentFields() {
  const { register } = useFormContext<MemberFormValues>();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input label="Date of joining" type="date" {...register("date_of_joining")} />
      <div className="hidden sm:block" aria-hidden />
      <Input label="Address line 1" {...register("address_line1")} />
      <Input label="Address line 2" {...register("address_line2")} />
      <Input label="City" {...register("city")} />
      <Input label="State" {...register("state")} />
      <Input label="Pincode" {...register("pincode")} />
    </div>
  );
}

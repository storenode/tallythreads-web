import { useState } from "react";
import { Store, User, Building2, Network, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { SingleSelect } from "@/components/ui/SingleSelect";
import type { CreateStoreInput } from "@/features/stores/storesAdmin";
import {
  FRANCHISE_DEMO_DEFAULTS,
  LEGAL_ENTITY_OPTIONS,
  STATUS_OPTIONS,
  FY_MONTH_OPTIONS,
  newFranchiseStore,
  useCreateFranchiseDemo,
  type OrgDraft,
  type MemberDraft,
  type FranchiseStoreDraft,
  type FranchiseDemoInput,
} from "./franchise.demo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Section({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
          <span className="text-tt-green-500">{icon}</span>
          {title}
        </h4>
        {action}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function MemberFields({
  member,
  onChange,
}: {
  member: MemberDraft;
  onChange: (key: keyof MemberDraft, value: string) => void;
}) {
  const set = (key: keyof MemberDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange(key, e.target.value);
  return (
    <>
      <Input label="Full name" value={member.fullName} onChange={set("fullName")} />
      <Input
        label="Email"
        type="email"
        value={member.email}
        onChange={set("email")}
        error={
          member.email.trim() !== "" && !EMAIL_RE.test(member.email.trim())
            ? "Enter a valid email"
            : undefined
        }
      />
      <Input
        label="Mobile number"
        value={member.mobileNumber}
        onChange={set("mobileNumber")}
      />
      <Input
        label="Date of joining"
        type="date"
        value={member.dateOfJoining}
        onChange={set("dateOfJoining")}
      />
      <Input
        label="Aadhaar number"
        value={member.aadhaarNumber}
        onChange={set("aadhaarNumber")}
      />
      <Input label="PAN" value={member.panNumber} onChange={set("panNumber")} />
      <Input
        label="Emergency contact name"
        value={member.emergencyContactName}
        onChange={set("emergencyContactName")}
      />
      <Input
        label="Emergency contact phone"
        value={member.emergencyContactPhone}
        onChange={set("emergencyContactPhone")}
      />
      <Input
        label="Address line 1"
        value={member.addressLine1}
        onChange={set("addressLine1")}
      />
      <Input
        label="Address line 2"
        value={member.addressLine2}
        onChange={set("addressLine2")}
      />
      <Input label="City" value={member.city} onChange={set("city")} />
      <Input label="State" value={member.state} onChange={set("state")} />
      <Input label="Pincode" value={member.pincode} onChange={set("pincode")} />
    </>
  );
}

function StoreFields({
  store,
  onChange,
}: {
  store: CreateStoreInput;
  onChange: (key: keyof CreateStoreInput, value: string) => void;
}) {
  const set = (key: keyof CreateStoreInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange(key, e.target.value);
  return (
    <>
      <Input label="Store code" value={store.store_code} onChange={set("store_code")} />
      <Input label="Name" value={store.name} onChange={set("name")} />
      <Input
        label="Address line 1"
        value={store.address_line1}
        onChange={set("address_line1")}
      />
      <Input
        label="Address line 2"
        value={store.address_line2}
        onChange={set("address_line2")}
      />
      <Input label="City" value={store.city} onChange={set("city")} />
      <Input label="State" value={store.state} onChange={set("state")} />
      <Input label="Pincode" value={store.pincode} onChange={set("pincode")} />
      <Input label="Country" value={store.country} onChange={set("country")} />
      <Input
        label="Phone number"
        value={store.phone_number}
        onChange={set("phone_number")}
      />
      <Input label="Email" type="email" value={store.email} onChange={set("email")} />
      <Input label="GSTIN" value={store.gstin} onChange={set("gstin")} />
      <Input
        label="Opening time"
        type="time"
        value={store.opening_time}
        onChange={set("opening_time")}
      />
      <Input
        label="Closing time"
        type="time"
        value={store.closing_time}
        onChange={set("closing_time")}
      />
    </>
  );
}

export function CreateFranchiseForm() {
  const [org, setOrg] = useState<OrgDraft>(FRANCHISE_DEMO_DEFAULTS.org);
  const [groupName, setGroupName] = useState(FRANCHISE_DEMO_DEFAULTS.groupName);
  const [owner, setOwner] = useState<MemberDraft>(FRANCHISE_DEMO_DEFAULTS.owner);
  const [stores, setStores] = useState<FranchiseStoreDraft[]>(
    FRANCHISE_DEMO_DEFAULTS.stores,
  );

  const createDemo = useCreateFranchiseDemo();

  const setOrgField =
    (key: keyof OrgDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setOrg((o) => ({ ...o, [key]: e.target.value }));

  const setOwnerField = (key: keyof MemberDraft, value: string) =>
    setOwner((m) => ({ ...m, [key]: value }));

  const setStoreField = (index: number, key: keyof CreateStoreInput, value: string) =>
    setStores((list) =>
      list.map((s, i) =>
        i === index ? { ...s, store: { ...s.store, [key]: value } } : s,
      ),
    );

  const setStaffField = (index: number, key: keyof MemberDraft, value: string) =>
    setStores((list) =>
      list.map((s, i) =>
        i === index ? { ...s, salesStaff: { ...s.salesStaff, [key]: value } } : s,
      ),
    );

  const setAgreementField = (
    index: number,
    key: "agreementStart" | "agreementEnd",
    value: string,
  ) =>
    setStores((list) =>
      list.map((s, i) => (i === index ? { ...s, [key]: value } : s)),
    );

  const addStore = () => setStores((list) => [...list, newFranchiseStore()]);
  const removeStore = (index: number) =>
    setStores((list) => list.filter((_, i) => i !== index));

  const canSubmit =
    org.name.trim() !== "" &&
    groupName.trim() !== "" &&
    EMAIL_RE.test(owner.email.trim()) &&
    stores.length > 0 &&
    stores.every(
      (s) => EMAIL_RE.test(s.salesStaff.email.trim()) && s.agreementStart !== "",
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const input: FranchiseDemoInput = { org, groupName, owner, stores };
    await createDemo.mutateAsync(input).catch(() => {
      /* error surfaced via createDemo.error below */
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <Section icon={<Building2 size={16} />} title="Organization">
        <Input label="Name" value={org.name} onChange={setOrgField("name")} />
        <Input
          label="Legal name"
          value={org.legal_name}
          onChange={setOrgField("legal_name")}
        />
        <SingleSelect
          label="Legal entity type"
          options={LEGAL_ENTITY_OPTIONS.map((o) => ({ ...o }))}
          value={org.legal_entity_type}
          onChange={(e) =>
            setOrg((o) => ({ ...o, legal_entity_type: e.target.value }))
          }
        />
        <Input label="GSTIN" value={org.gstin} onChange={setOrgField("gstin")} />
        <Input label="PAN" value={org.pan} onChange={setOrgField("pan")} />
        <Input
          label="Address line 1"
          value={org.address_line1}
          onChange={setOrgField("address_line1")}
        />
        <Input
          label="Address line 2"
          value={org.address_line2}
          onChange={setOrgField("address_line2")}
        />
        <Input label="City" value={org.city} onChange={setOrgField("city")} />
        <Input label="State" value={org.state} onChange={setOrgField("state")} />
        <Input
          label="Pincode"
          value={org.pincode}
          onChange={setOrgField("pincode")}
        />
        <Input
          label="Country"
          value={org.country}
          onChange={setOrgField("country")}
        />
        <Input
          label="Primary contact phone"
          value={org.primary_contact_phone}
          onChange={setOrgField("primary_contact_phone")}
        />
        <Input
          label="Website"
          type="url"
          value={org.website}
          onChange={setOrgField("website")}
        />
        <SingleSelect
          label="Financial year starts"
          options={FY_MONTH_OPTIONS.map((o) => ({ ...o }))}
          value={org.financial_year_start_month}
          onChange={(e) =>
            setOrg((o) => ({ ...o, financial_year_start_month: e.target.value }))
          }
        />
        <Input
          label="Preferred language"
          value={org.preferred_language}
          onChange={setOrgField("preferred_language")}
        />
        <SingleSelect
          label="Status"
          options={STATUS_OPTIONS.map((o) => ({ ...o }))}
          value={org.status}
          onChange={(e) => setOrg((o) => ({ ...o, status: e.target.value }))}
        />
        <Input label="Notes" value={org.notes} onChange={setOrgField("notes")} />
      </Section>

      <Section icon={<Network size={16} />} title="Franchise">
        <Input
          label="Franchise group name"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
        />
      </Section>

      <Section icon={<User size={16} />} title="Owner · org_owner">
        <MemberFields member={owner} onChange={setOwnerField} />
      </Section>

      {stores.map((s, index) => (
        <div
          key={index}
          className="space-y-6 rounded-xl border border-gray-200 p-4 dark:border-gray-800"
        >
          <Section
            icon={<Store size={16} />}
            title={`Store ${index + 1}`}
            action={
              stores.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="!text-red-500 hover:enabled:!bg-red-500/10"
                  onClick={() => removeStore(index)}
                >
                  <Trash2 size={16} />
                  Remove
                </Button>
              ) : undefined
            }
          >
            <StoreFields
              store={s.store}
              onChange={(key, value) => setStoreField(index, key, value)}
            />
            <Input
              label="Agreement start"
              type="date"
              value={s.agreementStart}
              onChange={(e) =>
                setAgreementField(index, "agreementStart", e.target.value)
              }
            />
            <Input
              label="Agreement end (optional)"
              type="date"
              value={s.agreementEnd}
              onChange={(e) =>
                setAgreementField(index, "agreementEnd", e.target.value)
              }
            />
          </Section>
          <Section
            icon={<User size={16} />}
            title={`Store ${index + 1} sales staff · store_sales_staff`}
          >
            <MemberFields
              member={s.salesStaff}
              onChange={(key, value) => setStaffField(index, key, value)}
            />
          </Section>
        </div>
      ))}

      <div>
        <Button type="button" variant="ghost" size="sm" onClick={addStore}>
          <Plus size={16} />
          Add store
        </Button>
      </div>

      {createDemo.isError && (
        <p className="text-sm text-red-500">
          {createDemo.error instanceof Error
            ? createDemo.error.message
            : "Couldn't create the demo organization."}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={!canSubmit || createDemo.isPending}>
          {createDemo.isPending && <Spinner size={18} />}
          Create demo organization
        </Button>
      </div>
    </form>
  );
}

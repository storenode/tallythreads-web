import { useState } from "react";
import { Store, User, Building2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { SingleSelect } from "@/components/ui/SingleSelect";
import {
  INDEPENDENT_DEMO_DEFAULTS,
  LEGAL_ENTITY_OPTIONS,
  STATUS_OPTIONS,
  FY_MONTH_OPTIONS,
  useCreateIndependentDemo,
  type OrgDraft,
  type MemberDraft,
  type IndependentDemoInput,
} from "./independent.demo";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-white/90">
        <span className="text-tt-green-500">{icon}</span>
        {title}
      </h4>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function CreateIndependentForm() {
  const [org, setOrg] = useState<OrgDraft>(INDEPENDENT_DEMO_DEFAULTS.org);
  const [store, setStore] = useState(INDEPENDENT_DEMO_DEFAULTS.store);
  const [owner, setOwner] = useState<MemberDraft>(
    INDEPENDENT_DEMO_DEFAULTS.owner,
  );
  const [salesStaff, setSalesStaff] = useState<MemberDraft>(
    INDEPENDENT_DEMO_DEFAULTS.salesStaff,
  );

  const createDemo = useCreateIndependentDemo();

  const setOrgField =
    (key: keyof OrgDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setOrg((o) => ({ ...o, [key]: e.target.value }));
  const setStoreField =
    (key: keyof typeof store) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setStore((s) => ({ ...s, [key]: e.target.value }));
  const setMember =
    (
      setter: React.Dispatch<React.SetStateAction<MemberDraft>>,
      key: keyof MemberDraft,
    ) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setter((m) => ({ ...m, [key]: e.target.value }));

  const canSubmit =
    org.name.trim() !== "" &&
    EMAIL_RE.test(owner.email.trim()) &&
    EMAIL_RE.test(salesStaff.email.trim());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const input: IndependentDemoInput = { org, store, owner, salesStaff };
    await createDemo.mutateAsync(input).catch(() => {
      /* error surfaced via createDemo.error below */
    });
  };

  const memberFields = (
    m: MemberDraft,
    setter: React.Dispatch<React.SetStateAction<MemberDraft>>,
  ) => (
    <>
      <Input
        label="Full name"
        value={m.fullName}
        onChange={setMember(setter, "fullName")}
      />
      <Input
        label="Email"
        type="email"
        value={m.email}
        onChange={setMember(setter, "email")}
        error={
          m.email.trim() !== "" && !EMAIL_RE.test(m.email.trim())
            ? "Enter a valid email"
            : undefined
        }
      />
      <Input
        label="Mobile number"
        value={m.mobileNumber}
        onChange={setMember(setter, "mobileNumber")}
      />
      <Input
        label="Date of joining"
        type="date"
        value={m.dateOfJoining}
        onChange={setMember(setter, "dateOfJoining")}
      />
      <Input
        label="Aadhaar number"
        value={m.aadhaarNumber}
        onChange={setMember(setter, "aadhaarNumber")}
      />
      <Input
        label="PAN"
        value={m.panNumber}
        onChange={setMember(setter, "panNumber")}
      />
      <Input
        label="Emergency contact name"
        value={m.emergencyContactName}
        onChange={setMember(setter, "emergencyContactName")}
      />
      <Input
        label="Emergency contact phone"
        value={m.emergencyContactPhone}
        onChange={setMember(setter, "emergencyContactPhone")}
      />
      <Input
        label="Address line 1"
        value={m.addressLine1}
        onChange={setMember(setter, "addressLine1")}
      />
      <Input
        label="Address line 2"
        value={m.addressLine2}
        onChange={setMember(setter, "addressLine2")}
      />
      <Input
        label="City"
        value={m.city}
        onChange={setMember(setter, "city")}
      />
      <Input
        label="State"
        value={m.state}
        onChange={setMember(setter, "state")}
      />
      <Input
        label="Pincode"
        value={m.pincode}
        onChange={setMember(setter, "pincode")}
      />
    </>
  );

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
        <Input
          label="State"
          value={org.state}
          onChange={setOrgField("state")}
        />
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
            setOrg((o) => ({
              ...o,
              financial_year_start_month: e.target.value,
            }))
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
        <Input
          label="Notes"
          value={org.notes}
          onChange={setOrgField("notes")}
        />
      </Section>

      <Section icon={<Store size={16} />} title="Store">
        <Input
          label="Store code"
          value={store.store_code}
          onChange={setStoreField("store_code")}
        />
        <Input
          label="Name"
          value={store.name}
          onChange={setStoreField("name")}
        />
        <Input
          label="Address line 1"
          value={store.address_line1}
          onChange={setStoreField("address_line1")}
        />
        <Input
          label="Address line 2"
          value={store.address_line2}
          onChange={setStoreField("address_line2")}
        />
        <Input
          label="City"
          value={store.city}
          onChange={setStoreField("city")}
        />
        <Input
          label="State"
          value={store.state}
          onChange={setStoreField("state")}
        />
        <Input
          label="Pincode"
          value={store.pincode}
          onChange={setStoreField("pincode")}
        />
        <Input
          label="Country"
          value={store.country}
          onChange={setStoreField("country")}
        />
        <Input
          label="Phone number"
          value={store.phone_number}
          onChange={setStoreField("phone_number")}
        />
        <Input
          label="Email"
          type="email"
          value={store.email}
          onChange={setStoreField("email")}
        />
        <Input
          label="GSTIN"
          value={store.gstin}
          onChange={setStoreField("gstin")}
        />
        <Input
          label="Opening time"
          type="time"
          value={store.opening_time}
          onChange={setStoreField("opening_time")}
        />
        <Input
          label="Closing time"
          type="time"
          value={store.closing_time}
          onChange={setStoreField("closing_time")}
        />
      </Section>

      <Section icon={<User size={16} />} title="Owner · org_owner">
        {memberFields(owner, setOwner)}
      </Section>

      <Section icon={<User size={16} />} title="Sales staff · store_sales_staff">
        {memberFields(salesStaff, setSalesStaff)}
      </Section>

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

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createOrganization,
  updateOrganization,
  inviteOrganizationMember,
  type LegalEntityType,
  type OrganizationStatus,
  type UpdateOrganizationInput,
} from "../../organizations/organizations";
import {
  createStore,
  inviteStoreMember,
  type CreateStoreInput,
} from "@/features/stores/storesAdmin";

/**
 * A single editable draft for the "Vasavi Cloth Store" independent demo. Every
 * field is prefilled with realistic mock data (see INDEPENDENT_DEMO_DEFAULTS) so the
 * demo form never shows an empty box; the presenter tweaks anything before creating.
 */
export interface OrgDraft {
  name: string;
  legal_name: string;
  legal_entity_type: string;
  gstin: string;
  pan: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  primary_contact_phone: string;
  website: string;
  /** "" or a 1-12 month number as a string (SingleSelect value). */
  financial_year_start_month: string;
  preferred_language: string;
  status: string;
  notes: string;
}

/** One member row: single full-name input plus the full profile, all editable. */
export interface MemberDraft {
  fullName: string;
  email: string;
  mobileNumber: string;
  aadhaarNumber: string;
  panNumber: string;
  /** "" or ISO yyyy-mm-dd. */
  dateOfJoining: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
}

export interface IndependentDemoInput {
  org: OrgDraft;
  store: CreateStoreInput;
  owner: MemberDraft;
  salesStaff: MemberDraft;
}

// Mock GSTIN: AP state code (37) + the PAN + entity/check chars, so the field isn't
// empty. Clear it in the form to represent a genuinely unregistered proprietor.
const MOCK_GSTIN = "37AAAPV9012K1ZP";

export const INDEPENDENT_DEMO_DEFAULTS: IndependentDemoInput = {
  org: {
    name: "Vasavi Cloth Store",
    legal_name: "Vasavi Cloth Store",
    legal_entity_type: "proprietorship",
    gstin: MOCK_GSTIN,
    pan: "AAAPV9012K",
    address_line1: "12/3 Bazaar Street",
    address_line2: "Near Clock Tower",
    city: "Proddatur",
    state: "Andhra Pradesh",
    pincode: "516360",
    country: "India",
    primary_contact_phone: "+91 98480 12345",
    website: "https://vasavicloth.example.in",
    financial_year_start_month: "4",
    preferred_language: "te",
    status: "trial",
    notes: "Demo organization for a sales walkthrough.",
  },
  store: {
    name: "Vasavi Cloth Store",
    store_code: "VCS-PDT",
    address_line1: "12/3 Bazaar Street",
    address_line2: "Near Clock Tower",
    city: "Proddatur",
    state: "Andhra Pradesh",
    pincode: "516360",
    country: "India",
    phone_number: "+91 98480 12345",
    email: "store@vasavicloth.example.in",
    gstin: MOCK_GSTIN,
    opening_time: "10:00",
    closing_time: "21:30",
  },
  owner: {
    fullName: "Padmavathi Devi",
    email: "padmavathi.devi@vasavicloth.example.in",
    mobileNumber: "+91 98480 12345",
    aadhaarNumber: "2345 6789 0123",
    panNumber: "ABCPD1234K",
    dateOfJoining: "2024-04-01",
    emergencyContactName: "Ramesh Devi",
    emergencyContactPhone: "+91 98480 54321",
    addressLine1: "12/3 Bazaar Street",
    addressLine2: "Near Clock Tower",
    city: "Proddatur",
    state: "Andhra Pradesh",
    pincode: "516360",
  },
  salesStaff: {
    fullName: "Swathi Rani",
    email: "swathi.rani@vasavicloth.example.in",
    mobileNumber: "+91 90000 22334",
    aadhaarNumber: "3456 7890 1234",
    panNumber: "BXYPS6789L",
    dateOfJoining: "2024-06-15",
    emergencyContactName: "Anjali Rani",
    emergencyContactPhone: "+91 90000 33445",
    addressLine1: "48 Weavers Colony",
    addressLine2: "Gandhi Road",
    city: "Proddatur",
    state: "Andhra Pradesh",
    pincode: "516360",
  },
};

// Option lists for the select fields. Kept local (small, and OrganizationForm's are
// not exported) rather than reaching into the page component.
export const LEGAL_ENTITY_OPTIONS: { value: LegalEntityType; label: string }[] = [
  { value: "proprietorship", label: "Proprietorship" },
  { value: "partnership", label: "Partnership" },
  { value: "llp", label: "LLP" },
  { value: "private_limited", label: "Private Limited" },
  { value: "huf", label: "HUF" },
  { value: "other", label: "Other" },
];

export const STATUS_OPTIONS: { value: OrganizationStatus; label: string }[] = [
  { value: "trial", label: "Trial" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "churned", label: "Churned" },
];

export const FY_MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, i) => ({ value: String(i + 1), label }));

/** Blank string → null (mirrors OrganizationForm / storesAdmin handling). */
function n(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

/** Split a full name on the last space into first/last (last name may be ""). */
function splitName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim();
  const i = trimmed.lastIndexOf(" ");
  if (i === -1) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, i).trim(),
    lastName: trimmed.slice(i + 1).trim(),
  };
}

function memberProfile(m: MemberDraft) {
  const { firstName, lastName } = splitName(m.fullName);
  return {
    firstName,
    lastName,
    mobileNumber: m.mobileNumber,
    aadhaarNumber: m.aadhaarNumber,
    panNumber: m.panNumber,
    dateOfJoining: m.dateOfJoining,
    emergencyContactName: m.emergencyContactName,
    emergencyContactPhone: m.emergencyContactPhone,
    addressLine1: m.addressLine1,
    addressLine2: m.addressLine2,
    city: m.city,
    state: m.state,
    pincode: m.pincode,
  };
}

function buildOrgPatch(org: OrgDraft): UpdateOrganizationInput {
  const patch: UpdateOrganizationInput = {
    legal_name: n(org.legal_name),
    legal_entity_type: (n(org.legal_entity_type) as LegalEntityType | null) ?? null,
    gstin: n(org.gstin),
    pan: n(org.pan),
    address_line1: n(org.address_line1),
    address_line2: n(org.address_line2),
    city: n(org.city),
    state: n(org.state),
    pincode: n(org.pincode),
    country: n(org.country),
    primary_contact_phone: n(org.primary_contact_phone),
    website: n(org.website),
    preferred_language: n(org.preferred_language),
    notes: n(org.notes),
    financial_year_start_month: org.financial_year_start_month
      ? Number(org.financial_year_start_month)
      : null,
  };
  if (org.status) patch.status = org.status as OrganizationStatus;
  return patch;
}

/**
 * Orchestrates a complete independent demo by reusing the existing data-layer
 * functions — provision the org, patch its registration details, create the single
 * store, then invite both members (whose names/profiles are stored only via the
 * invite RPCs). One mutation so the form gets a single pending/error state.
 */
export function useCreateIndependentDemo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: IndependentDemoInput) => {
      const org = await createOrganization({
        name: input.org.name.trim(),
        registration_type: "independent",
        is_demo: true,
        invites: [],
      });

      await updateOrganization(org.id, buildOrgPatch(input.org));

      const store = await createStore(org.id, input.store);

      await inviteOrganizationMember(org.id, {
        ...memberProfile(input.owner),
        email: input.owner.email.trim(),
        role_name: "org_owner",
        is_primary_contact: true,
      });

      await inviteStoreMember(store.id, {
        ...memberProfile(input.salesStaff),
        email: input.salesStaff.email.trim(),
        role_name: "store_sales_staff",
      });

      return org;
    },
    onSuccess: (org) => {
      // Drives useOrganizations() in demo.independent.tsx → the view swaps to the
      // org card; and the org card's StoreCard reads the stores-by-org query.
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
      queryClient.invalidateQueries({
        queryKey: ["org-portal", "stores", org.id],
      });
    },
  });
}

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
import { seedDemoPurchaseTrips } from "./purchaseTrips.demo";

// NOTE: This file is intentionally self-contained — it does not import from the
// independent.* demo files. The small types/helpers/option lists below are copied so
// the Chain flow can evolve independently of the Individual flow.

/** Editable organization draft (all fields prefilled so the form has no empty boxes). */
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

/** A chain store: the store details plus the sales-staff member that runs it. */
export interface ChainStoreDraft {
  store: CreateStoreInput;
  salesStaff: MemberDraft;
}

export interface ChainDemoInput {
  org: OrgDraft;
  owner: MemberDraft;
  stores: ChainStoreDraft[];
}

// Mock GSTIN: AP state code (37) + the company PAN + entity/check chars, so the field
// isn't empty. A chain typically registers as a company under one GSTIN/PAN.
const MOCK_GSTIN = "37AAACS1234F1Z8";
const MOCK_PAN = "AAACS1234F";

export const CHAIN_DEMO_DEFAULTS: ChainDemoInput = {
  org: {
    name: "Sri Lakshmi Textiles",
    legal_name: "Sri Lakshmi Textiles Pvt Ltd",
    legal_entity_type: "private_limited",
    gstin: MOCK_GSTIN,
    pan: MOCK_PAN,
    address_line1: "22 Main Bazaar Road",
    address_line2: "Opp. Municipal Office",
    city: "Proddatur",
    state: "Andhra Pradesh",
    pincode: "516360",
    country: "India",
    primary_contact_phone: "+91 98490 11223",
    website: "https://srilakshmitextiles.example.in",
    financial_year_start_month: "4",
    preferred_language: "te",
    status: "trial",
    notes: "Demo chain organization for a sales walkthrough.",
  },
  owner: {
    fullName: "Lakshmi Narayana",
    email: "lakshmi.narayana@srilakshmitextiles.example.in",
    mobileNumber: "+91 98490 11223",
    aadhaarNumber: "4567 8901 2345",
    panNumber: "ABCPL2345M",
    dateOfJoining: "2023-04-01",
    emergencyContactName: "Saroja Devi",
    emergencyContactPhone: "+91 98490 33445",
    addressLine1: "22 Main Bazaar Road",
    addressLine2: "Opp. Municipal Office",
    city: "Proddatur",
    state: "Andhra Pradesh",
    pincode: "516360",
  },
  stores: [
    {
      store: {
        name: "Sri Lakshmi Textiles — Proddatur",
        store_code: "SLT-PDT",
        address_line1: "22 Main Bazaar Road",
        address_line2: "Opp. Municipal Office",
        city: "Proddatur",
        state: "Andhra Pradesh",
        pincode: "516360",
        country: "India",
        phone_number: "+91 98490 11223",
        email: "proddatur@srilakshmitextiles.example.in",
        gstin: MOCK_GSTIN,
        opening_time: "10:00",
        closing_time: "21:30",
      },
      salesStaff: {
        fullName: "Ravi Teja",
        email: "ravi.teja@srilakshmitextiles.example.in",
        mobileNumber: "+91 90001 22334",
        aadhaarNumber: "5678 9012 3456",
        panNumber: "BXYPR7890L",
        dateOfJoining: "2024-05-10",
        emergencyContactName: "Suresh Teja",
        emergencyContactPhone: "+91 90001 44556",
        addressLine1: "5 Weavers Colony",
        addressLine2: "Gandhi Road",
        city: "Proddatur",
        state: "Andhra Pradesh",
        pincode: "516360",
      },
    },
    {
      store: {
        name: "Sri Lakshmi Textiles — Kadapa",
        store_code: "SLT-KDP",
        address_line1: "48 Nagarajupeta",
        address_line2: "Near Bus Stand",
        city: "Kadapa",
        state: "Andhra Pradesh",
        pincode: "516001",
        country: "India",
        phone_number: "+91 98490 55667",
        email: "kadapa@srilakshmitextiles.example.in",
        gstin: MOCK_GSTIN,
        opening_time: "10:00",
        closing_time: "21:30",
      },
      salesStaff: {
        fullName: "Sirisha Reddy",
        email: "sirisha.reddy@srilakshmitextiles.example.in",
        mobileNumber: "+91 90002 33445",
        aadhaarNumber: "6789 0123 4567",
        panNumber: "CXYPS8901M",
        dateOfJoining: "2024-07-01",
        emergencyContactName: "Mohan Reddy",
        emergencyContactPhone: "+91 90002 55667",
        addressLine1: "12 Nagarajupeta",
        addressLine2: "Near Bus Stand",
        city: "Kadapa",
        state: "Andhra Pradesh",
        pincode: "516001",
      },
    },
  ],
};

/** A fresh, prefilled store row for the "Add store" button (no empty boxes). */
export function newChainStore(): ChainStoreDraft {
  return {
    store: {
      name: "Sri Lakshmi Textiles — New Branch",
      store_code: "SLT-NEW",
      address_line1: "New Branch Address",
      address_line2: "",
      city: "Proddatur",
      state: "Andhra Pradesh",
      pincode: "516360",
      country: "India",
      phone_number: "+91 90000 00000",
      email: "newbranch@srilakshmitextiles.example.in",
      gstin: MOCK_GSTIN,
      opening_time: "10:00",
      closing_time: "21:30",
    },
    salesStaff: {
      fullName: "New Staff",
      email: "new.staff@srilakshmitextiles.example.in",
      mobileNumber: "+91 90000 00001",
      aadhaarNumber: "0000 0000 0000",
      panNumber: "AAAPN0000A",
      dateOfJoining: "2024-01-01",
      emergencyContactName: "Emergency Contact",
      emergencyContactPhone: "+91 90000 00002",
      addressLine1: "New Branch Address",
      addressLine2: "",
      city: "Proddatur",
      state: "Andhra Pradesh",
      pincode: "516360",
    },
  };
}

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
 * Orchestrates a complete chain demo: provision the org, patch its registration
 * details, invite the owner, then for each store create it and invite its sales
 * staff. One mutation so the form gets a single pending/error state.
 */
export function useCreateChainDemo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChainDemoInput) => {
      const org = await createOrganization({
        name: input.org.name.trim(),
        registration_type: "chain",
        is_demo: true,
        invites: [],
      });

      await updateOrganization(org.id, buildOrgPatch(input.org));

      const owner = await inviteOrganizationMember(org.id, {
        ...memberProfile(input.owner),
        email: input.owner.email.trim(),
        role_name: "org_owner",
        is_primary_contact: true,
      });

      for (const s of input.stores) {
        const store = await createStore(org.id, s.store);
        await inviteStoreMember(store.id, {
          ...memberProfile(s.salesStaff),
          email: s.salesStaff.email.trim(),
          role_name: "store_sales_staff",
        });
      }

      await seedDemoPurchaseTrips(org.id, owner.member_id, input.org.name.trim());

      return org;
    },
    onSuccess: (org) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
      queryClient.invalidateQueries({
        queryKey: ["org-portal", "stores", org.id],
      });
    },
  });
}

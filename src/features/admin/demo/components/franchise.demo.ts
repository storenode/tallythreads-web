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
import {
  createFranchiseGroup,
  linkStoreToFranchise,
} from "../../franchises/franchiseGroups";
import { seedDemoPurchaseTrips } from "./purchaseTrips.demo";

// Self-contained: this file does not import from the independent.* or chain.* demo
// files. Small types/helpers below are local copies. It DOES reuse the real franchise
// data layer (franchiseGroups.ts) so the demo produces genuine franchise linkage.

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

/** A franchised store: store details, its sales-staff, and the agreement window. */
export interface FranchiseStoreDraft {
  store: CreateStoreInput;
  salesStaff: MemberDraft;
  /** ISO yyyy-mm-dd, required. */
  agreementStart: string;
  /** "" = active (no end date). */
  agreementEnd: string;
}

export interface FranchiseDemoInput {
  org: OrgDraft;
  groupName: string;
  owner: MemberDraft;
  stores: FranchiseStoreDraft[];
}

// Mock GSTIN: TN state code (33) + the company PAN + entity/check chars, so the field
// isn't empty.
// AP state code (37) + the company PAN + entity/check chars, so the field isn't empty.
const MOCK_GSTIN = "37AAACB4567Q1Z5";
const MOCK_PAN = "AAACB4567Q";

export const FRANCHISE_DEMO_DEFAULTS: FranchiseDemoInput = {
  org: {
    name: "BANDRIP STREETWEAR STORE",
    legal_name: "Bandrip Streetwear Store Pvt Ltd",
    legal_entity_type: "private_limited",
    gstin: MOCK_GSTIN,
    pan: MOCK_PAN,
    address_line1: "3/1917, Rajareddy St",
    address_line2: "opposite NARAYANA EM SCHOOL",
    city: "Kadapa",
    state: "Andhra Pradesh",
    pincode: "516001",
    country: "India",
    primary_contact_phone: "+91 80083 72120",
    website: "https://bandrip.example.in",
    financial_year_start_month: "4",
    preferred_language: "te",
    status: "trial",
    notes: "Demo franchise organization for a sales walkthrough.",
  },
  groupName: "Bandrip Streetwear Network",
  owner: {
    fullName: "Bandrip Owner",
    email: "owner@bandrip.example.in",
    mobileNumber: "+91 80083 72120",
    aadhaarNumber: "1122 3344 5566",
    panNumber: "ABCPB1234N",
    dateOfJoining: "2023-04-01",
    emergencyContactName: "Bandrip Emergency",
    emergencyContactPhone: "+91 80083 72121",
    addressLine1: "3/1917, Rajareddy St",
    addressLine2: "opposite NARAYANA EM SCHOOL",
    city: "Kadapa",
    state: "Andhra Pradesh",
    pincode: "516001",
  },
  stores: [
    {
      store: {
        name: "Bandrip — Kadapa",
        store_code: "BND-KDP",
        address_line1: "3/1917, Rajareddy St",
        address_line2: "opposite NARAYANA EM SCHOOL",
        city: "Kadapa",
        state: "Andhra Pradesh",
        pincode: "516001",
        country: "India",
        phone_number: "+91 80083 72120",
        email: "kadapa@bandrip.example.in",
        gstin: MOCK_GSTIN,
        opening_time: "10:00",
        closing_time: "21:30",
      },
      salesStaff: {
        fullName: "Kadapa Staff",
        email: "kadapa.staff@bandrip.example.in",
        mobileNumber: "+91 90000 10001",
        aadhaarNumber: "2233 4455 6677",
        panNumber: "BXYPK1001M",
        dateOfJoining: "2024-05-10",
        emergencyContactName: "Kadapa Emergency",
        emergencyContactPhone: "+91 90000 10002",
        addressLine1: "3/1917, Rajareddy St",
        addressLine2: "opposite NARAYANA EM SCHOOL",
        city: "Kadapa",
        state: "Andhra Pradesh",
        pincode: "516001",
      },
      agreementStart: "2024-04-01",
      agreementEnd: "",
    },
    {
      store: {
        name: "Bandrip — Nellore",
        store_code: "BND-NLR",
        address_line1: "PLOT NO: 202, 6th Cross Rd",
        address_line2: "Magunta Layout",
        city: "Nellore",
        state: "Andhra Pradesh",
        pincode: "524003",
        country: "India",
        phone_number: "+91 90000 20001",
        email: "nellore@bandrip.example.in",
        gstin: MOCK_GSTIN,
        opening_time: "10:00",
        closing_time: "21:30",
      },
      salesStaff: {
        fullName: "Nellore Staff",
        email: "nellore.staff@bandrip.example.in",
        mobileNumber: "+91 90000 20002",
        aadhaarNumber: "3344 5566 7788",
        panNumber: "CXYPN2001M",
        dateOfJoining: "2024-06-01",
        emergencyContactName: "Nellore Emergency",
        emergencyContactPhone: "+91 90000 20003",
        addressLine1: "PLOT NO: 202, 6th Cross Rd",
        addressLine2: "Magunta Layout",
        city: "Nellore",
        state: "Andhra Pradesh",
        pincode: "524003",
      },
      agreementStart: "2024-04-01",
      agreementEnd: "",
    },
    {
      store: {
        name: "Bandrip — Tirupati",
        store_code: "BND-TPT",
        address_line1: "D.NO.23-14-68/A, Mahila University Rd",
        address_line2: "LB NAGAR, Padmavathi Nagar, Avilali",
        city: "Tirupati",
        state: "Andhra Pradesh",
        pincode: "517502",
        country: "India",
        phone_number: "+91 90000 30001",
        email: "tirupati@bandrip.example.in",
        gstin: MOCK_GSTIN,
        opening_time: "10:00",
        closing_time: "21:30",
      },
      salesStaff: {
        fullName: "Tirupati Staff",
        email: "tirupati.staff@bandrip.example.in",
        mobileNumber: "+91 90000 30002",
        aadhaarNumber: "4455 6677 8899",
        panNumber: "DXYPT3001M",
        dateOfJoining: "2024-06-15",
        emergencyContactName: "Tirupati Emergency",
        emergencyContactPhone: "+91 90000 30003",
        addressLine1: "D.NO.23-14-68/A, Mahila University Rd",
        addressLine2: "LB NAGAR, Padmavathi Nagar, Avilali",
        city: "Tirupati",
        state: "Andhra Pradesh",
        pincode: "517502",
      },
      agreementStart: "2024-04-01",
      agreementEnd: "",
    },
    {
      store: {
        name: "Bandrip — Anantapur",
        store_code: "BND-ATP",
        address_line1: "1-1348-O-12/A, 6th Ward",
        address_line2: "Ram Nagar, Maruthi Nagar",
        city: "Anantapur",
        state: "Andhra Pradesh",
        pincode: "515004",
        country: "India",
        phone_number: "+91 90000 40001",
        email: "anantapur@bandrip.example.in",
        gstin: MOCK_GSTIN,
        opening_time: "10:00",
        closing_time: "21:30",
      },
      salesStaff: {
        fullName: "Anantapur Staff",
        email: "anantapur.staff@bandrip.example.in",
        mobileNumber: "+91 90000 40002",
        aadhaarNumber: "5566 7788 9900",
        panNumber: "EXYPA4001M",
        dateOfJoining: "2024-07-01",
        emergencyContactName: "Anantapur Emergency",
        emergencyContactPhone: "+91 90000 40003",
        addressLine1: "1-1348-O-12/A, 6th Ward",
        addressLine2: "Ram Nagar, Maruthi Nagar",
        city: "Anantapur",
        state: "Andhra Pradesh",
        pincode: "515004",
      },
      agreementStart: "2024-04-01",
      agreementEnd: "",
    },
  ],
};

/** A fresh, prefilled franchised store for the "Add store" button (no empty boxes). */
export function newFranchiseStore(): FranchiseStoreDraft {
  return {
    store: {
      name: "Bandrip — New Branch",
      store_code: "BND-NEW",
      address_line1: "New Branch Address",
      address_line2: "",
      city: "Kadapa",
      state: "Andhra Pradesh",
      pincode: "516001",
      country: "India",
      phone_number: "+91 90000 00000",
      email: "newbranch@bandrip.example.in",
      gstin: MOCK_GSTIN,
      opening_time: "10:00",
      closing_time: "21:30",
    },
    salesStaff: {
      fullName: "New Staff",
      email: "new.staff@bandrip.example.in",
      mobileNumber: "+91 90000 00001",
      aadhaarNumber: "0000 0000 0000",
      panNumber: "AAAPN0000A",
      dateOfJoining: "2024-01-01",
      emergencyContactName: "Emergency Contact",
      emergencyContactPhone: "+91 90000 00002",
      addressLine1: "New Branch Address",
      addressLine2: "",
      city: "Kadapa",
      state: "Andhra Pradesh",
      pincode: "516001",
    },
    agreementStart: "2024-04-01",
    agreementEnd: "",
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
 * Orchestrates a complete franchise demo: provision the org, patch its details, create
 * the franchise group, invite the owner, then for each store create it, link it to the
 * group with an agreement, and invite its sales staff. Reuses the real franchise data
 * layer so the stores genuinely classify as "franchise" (store_business_model).
 */
export function useCreateFranchiseDemo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FranchiseDemoInput) => {
      const org = await createOrganization({
        name: input.org.name.trim(),
        registration_type: "franchise",
        is_demo: true,
        invites: [],
      });

      await updateOrganization(org.id, buildOrgPatch(input.org));

      const group = await createFranchiseGroup(org.id, input.groupName);

      const owner = await inviteOrganizationMember(org.id, {
        ...memberProfile(input.owner),
        email: input.owner.email.trim(),
        role_name: "org_owner",
        is_primary_contact: true,
      });

      for (const s of input.stores) {
        const store = await createStore(org.id, s.store);
        await linkStoreToFranchise(
          store.id,
          group.id,
          s.agreementStart,
          s.agreementEnd || null,
        );
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
      queryClient.invalidateQueries({
        queryKey: ["admin", "franchise", org.id],
      });
    },
  });
}

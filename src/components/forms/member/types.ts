/**
 * The member-profile fields shared by the org-scoped and store-scoped "add member"
 * pages — one shape, since both use the same {@link MemberForm} component and both
 * RPCs (invite_organization_member, invite_store_member) accept the identical
 * profile-field parameter names. Chosen for a textile/retail store operator's real
 * staff-record needs: Aadhaar + PAN as distinct identity fields (not a type-picker —
 * the realistic norm for Indian retail KYC), a reachable mobile number, an emergency
 * contact, date of joining, and a residential address. Bank/IFSC details are
 * deliberately excluded — too sensitive with no payroll module yet to justify it.
 */
export interface MemberProfileFields {
  firstName: string;
  lastName: string;
  mobileNumber: string;
  aadhaarNumber: string;
  panNumber: string;
  /** "" or an ISO yyyy-mm-dd date string (native <input type="date"> value). */
  dateOfJoining: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pincode: string;
}

export const emptyMemberProfileFields: MemberProfileFields = {
  firstName: "",
  lastName: "",
  mobileNumber: "",
  aadhaarNumber: "",
  panNumber: "",
  dateOfJoining: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  pincode: "",
};

function n(v: string): string | null {
  const trimmed = v.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Maps the shared form's camelCase fields onto invite_organization_member's /
 * invite_store_member's identically-named `invite_*` RPC params. A blank field
 * becomes null (never an empty string), so the RPC's own
 * `coalesce(invite_x, existing_x)` backfill behavior treats "left blank" the same
 * as "not provided at all".
 */
export function memberProfileRpcParams(fields: MemberProfileFields) {
  return {
    invite_first_name: n(fields.firstName),
    invite_last_name: n(fields.lastName),
    invite_mobile_number: n(fields.mobileNumber),
    invite_aadhaar_number: n(fields.aadhaarNumber),
    invite_pan_number: n(fields.panNumber),
    invite_date_of_joining: n(fields.dateOfJoining),
    invite_emergency_contact_name: n(fields.emergencyContactName),
    invite_emergency_contact_phone: n(fields.emergencyContactPhone),
    invite_address_line1: n(fields.addressLine1),
    invite_address_line2: n(fields.addressLine2),
    invite_city: n(fields.city),
    invite_state: n(fields.state),
    invite_pincode: n(fields.pincode),
  };
}

/** Shared result shape both invite RPCs return. */
export interface InviteMemberResult {
  member_id: string;
  email: string;
  role_name: string;
  already_member: boolean;
  is_placeholder: boolean;
}

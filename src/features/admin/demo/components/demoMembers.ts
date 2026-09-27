/**
 * Demo store managers. The setup wizard's Go-live gate needs every store to have an owner
 * (`store_manager`), so each demo store gets one alongside its sales staff. The manager is
 * prefilled from the store's sales-staff draft — same place/KYC shape, distinct name + email
 * (`kadapa.staff@…` → `kadapa.manager@…`) — and stays editable in the demo form.
 */

interface DemoPerson {
  fullName: string;
  email: string;
  mobileNumber: string;
}

/** A prefilled store-manager draft derived from the store's sales-staff draft. */
export function demoManagerFor<T extends DemoPerson>(staff: T): T {
  const email = staff.email.trim();
  const at = email.indexOf("@");
  const local = at > 0 ? email.slice(0, at) : "store";
  const domain = at > 0 ? email.slice(at + 1) : "example.in";
  const managerLocal = /\.staff$/.test(local)
    ? local.replace(/\.staff$/, ".manager")
    : `${local}.manager`;
  const name = staff.fullName.trim();
  return {
    ...staff,
    fullName: /\bStaff$/.test(name)
      ? name.replace(/\bStaff$/, "Manager")
      : `${name || "Store"} Manager`,
    email: `${managerLocal}@${domain}`,
    // Last digit bumped so the manager's number differs from the staff member's.
    mobileNumber: staff.mobileNumber.replace(/\d$/, (d) => String((Number(d) + 5) % 10)),
  };
}

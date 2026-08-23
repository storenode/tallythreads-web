import OrgCards from "./components/OrgCards";

/**
 * Platform-admin overview screen, rendered inside AdminShell (which owns the
 * header/sidenav/sign-out) — see M1b-Core-Tenancy-Schema.md §4/§5.
 */
export default function AdminPage() {
  return (
    <div className="space-y-3">
      <OrgCards />
    </div>
  );
}

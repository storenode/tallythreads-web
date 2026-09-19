import { Link } from "react-router-dom";
import type { OrganizationFullDetail } from "./organizations";
import { OrgDeleteControl } from "./OrgDeleteControl";
import { RegistrationTypeBadge, REGISTRATION_TYPE_META } from "./registrationType";
import { SetupProgressBar } from "./setupStatus";

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="size-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
      />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className="size-5"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39-9-8.11-8.11-8.11 8.11m16.22 0H2.25"
      />
    </svg>
  );
}

/**
 * Directory card for one organization — logo/initial, name + registration
 * badge, status, location, and a footer row with created date, store count,
 * and an inline Delete. The card body is a stretched link into the setup
 * wizard's Organization step, so the whole card (except the Delete control)
 * opens editing. Shared by the admin dashboard and the demo page.
 */
export function OrganizationCard({
  org,
  to = `/admin/setup/${org.id}/organization`,
  showDelete = true,
  action,
}: {
  org: OrganizationFullDetail;
  /** Where the card's stretched link goes (the setup wizard's Organization
   * step). Defaults to the admin console; the org console passes its own path. */
  to?: string;
  /** Whether to show the safe-delete control. Off in the org console — an org
   * member can't delete their own organization. */
  showDelete?: boolean;
  /** Optional extra control in the footer (e.g. the demo page's launch-links
   * button), rendered above the card's stretched link so it stays clickable. */
  action?: React.ReactNode;
}) {
  const location = [org.city, org.state].filter(Boolean).join(", ");
  const createdOn = new Date(org.created_at).toLocaleDateString("en-IN");

  return (
    <div className="relative rounded-md border border-border bg-surface p-4 shadow-sm transition-colors hover:bg-surface-2 sm:p-6">
      <Link
        to={to}
        aria-label={`Set up ${org.name}`}
        className="absolute inset-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />

      <div className="sm:flex sm:justify-between sm:gap-4 lg:gap-6">
        <div className="sm:order-last sm:shrink-0">
          {org.logo_url ? (
            <img
              alt=""
              src={org.logo_url}
              className="size-16 rounded-full object-cover sm:size-18"
            />
          ) : (
            <div
              className={`flex size-16 items-center justify-center rounded-full text-lg font-semibold sm:size-18 ${
                org.registration_type
                  ? `${REGISTRATION_TYPE_META[org.registration_type].bgClass} ${REGISTRATION_TYPE_META[org.registration_type].textClass}`
                  : "bg-surface-2 text-fg-muted"
              }`}
            >
              {org.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <div className="mt-4 sm:mt-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-medium text-pretty text-fg">
              {org.name}
            </h3>
            <RegistrationTypeBadge type={org.registration_type} />
          </div>

          <p className="mt-1 text-sm text-fg-muted">{org.status}</p>

          <p className="mt-4 line-clamp-2 text-sm text-pretty text-fg-muted">
            {location || "No address on file"}
          </p>
        </div>
      </div>

      <dl className="mt-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 lg:gap-6">
          <div className="flex items-center gap-2">
            <dt className="text-fg-muted">
              <span className="sr-only">Created on</span>
              <CalendarIcon />
            </dt>
            <dd className="text-xs text-fg-muted">{createdOn}</dd>
          </div>

          <div className="flex items-center gap-2">
            <dt className="text-fg-muted">
              <span className="sr-only">Stores</span>
              <StoreIcon />
            </dt>
            <dd className="text-xs text-fg-muted">
              {org.stores.length} store{org.stores.length === 1 ? "" : "s"}
            </dd>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2">
          {action}
          {showDelete && <OrgDeleteControl org={org} />}
        </div>
      </dl>

      <SetupProgressBar org={org} />
    </div>
  );
}

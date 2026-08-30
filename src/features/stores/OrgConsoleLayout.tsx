import { useParams } from "react-router-dom";
import ConsoleShell from "@/layouts/console/ConsoleShell";
import { getOrgNav } from "./nav";
import { OrgSwitcher } from "./OrgSwitcher";

/**
 * Thin wrapper around ConsoleShell for the org back-office — needed because the nav
 * (getOrgNav) has to carry the current :orgId into its link targets, which is only
 * known at render time, unlike adminNav's static list.
 */
export default function OrgConsoleLayout() {
  const { orgId } = useParams<{ orgId: string }>();
  return <ConsoleShell nav={getOrgNav(orgId ?? "")} headerExtra={<OrgSwitcher />} />;
}

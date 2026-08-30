import { Store } from "lucide-react";
import type { ConsoleNavSection } from "@/layouts/console/nav";

// Dedicated org back-office nav. A function, not a static list, because every link
// needs to carry the current :orgId (2026-08-30, once /org became org-scoped) —
// unlike adminNav, which has nowhere dynamic to point.
export function getOrgNav(orgId: string): ConsoleNavSection[] {
  return [
    {
      items: [{ label: "Stores", to: `/org/${orgId}/stores`, icon: Store }],
    },
  ];
}

import { Store } from "lucide-react";
import type { ConsoleNavSection } from "@/layouts/console/nav";

// Dedicated org back-office nav — replaces the adminNav placeholder that was
// standing in here (see storeRoutes' previous TODO). Grows as org-scoped pages
// land (members, settings, ...).
export const orgNav: ConsoleNavSection[] = [
  {
    items: [{ label: "Stores", to: "/org/stores", icon: Store }],
  },
];

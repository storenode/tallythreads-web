import { createBrowserRouter } from "react-router-dom";
import { authRoutes } from "@/features/auth/router";
import { homeRoutes } from "@/features/home/router";
import { adminRoutes } from "@/features/admin/router";
import { storeRoutes } from "./features/stores/router";
import { operationsRoutes } from "@/features/operations/router";

// The 2026-08-29 cleanup pared this back to marketing/home + Google login + PIN
// setup, then admin (/admin) and org back-office (/org) were rebuilt on the shared
// ConsoleShell. 2026-08-30 adds the operations area (/ops — billing/inventory/
// trips/reports/settings, bottom-tab shell instead of ConsoleShell's sidebar) plus
// RequireArea gating on all three route trees and the header AreaSwitcher. Nothing
// in supabase/ (migrations, RLS, edge functions) was touched by the 2026-08-29
// reset; this file just tracks which frontend route trees currently exist.
export const router = createBrowserRouter([
  ...homeRoutes,
  ...authRoutes,
  ...adminRoutes,
  ...storeRoutes,
  ...operationsRoutes,
]);

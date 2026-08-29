import { createBrowserRouter } from "react-router-dom";
import { authRoutes } from "@/features/auth/router";
import { homeRoutes } from "@/features/home/router";
import { adminRoutes } from "@/features/admin/router";

// Pared back to the foundation as of the 2026-08-29 cleanup: marketing/home + Google
// login + PIN setup only. The admin console, org portal, and store-ops (/app) shell
// (billing/inventory/trips/reports/settings) were all removed from src/ — see the
// delete list from that cleanup for what to bring back and when. Nothing in
// supabase/ (migrations, RLS, edge functions) was touched; this is a frontend-only
// reset.
export const router = createBrowserRouter([
  ...homeRoutes,
  ...authRoutes,
  ...adminRoutes,
]);

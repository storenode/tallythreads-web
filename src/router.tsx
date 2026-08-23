import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { authRoutes } from "@/features/auth/router";
import { adminRoutes } from "@/features/admin/router";
import { homeRoutes } from "@/features/home/router";
import { billingRoutes } from "@/features/billing/router";
import { inventoryRoutes } from "@/features/inventory/router";
import { tripsRoutes } from "@/features/trips/router";
import { reportsRoutes } from "@/features/reports/router";
import { settingsRoutes } from "@/features/settings/router";

export const router = createBrowserRouter([
  ...homeRoutes,
  ...authRoutes,
  ...adminRoutes,
  {
    path: "/app",
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <Navigate to="bill" replace /> },
          ...billingRoutes,
          ...inventoryRoutes,
          ...tripsRoutes,
          ...reportsRoutes,
          ...settingsRoutes,
        ],
      },
    ],
  },
]);

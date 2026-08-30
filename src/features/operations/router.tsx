import { Navigate, type RouteObject } from "react-router-dom";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { RequireArea } from "@/features/auth/RequireArea";
import { OperationsShell } from "@/layouts/operations";

export const operationsRoutes: RouteObject[] = [
  {
    path: "/ops",
    element: <AuthGuard />,
    children: [
      {
        element: <RequireArea area="ops" />,
        children: [
          {
            element: <OperationsShell />,
            children: [
              { index: true, element: <Navigate to="/ops/billing" replace /> },
              {
                path: "billing",
                lazy: async () => ({
                  Component: (await import("./pages/BillingPage")).default,
                }),
              },
              {
                path: "inventory",
                lazy: async () => ({
                  Component: (await import("./pages/InventoryPage")).default,
                }),
              },
              {
                path: "trips",
                lazy: async () => ({
                  Component: (await import("./pages/TripsPage")).default,
                }),
              },
              {
                path: "reports",
                lazy: async () => ({
                  Component: (await import("./pages/ReportsPage")).default,
                }),
              },
              {
                path: "settings",
                lazy: async () => ({
                  Component: (await import("./pages/SettingsPage")).default,
                }),
              },
            ],
          },
        ],
      },
    ],
  },
];

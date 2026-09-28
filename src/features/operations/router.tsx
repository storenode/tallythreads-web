import { Navigate, type RouteObject } from "react-router-dom";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { RequireArea } from "@/features/auth/RequireArea";
import { RequireStoreAccess } from "@/features/auth/RequireStoreAccess";
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
            index: true,
            lazy: async () => ({
              Component: (await import("./StorePickerPage")).default,
            }),
          },
          {
            path: ":storeId",
            element: <RequireStoreAccess />,
            children: [
              {
                element: <OperationsShell />,
                children: [
                  { index: true, element: <Navigate to="billing" replace /> },
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
                    // Receive one org → store dispatch (Inventory Phase 2D).
                    path: "inventory/receive/:transferId",
                    lazy: async () => ({
                      Component: (await import("./pages/ReceivePage")).default,
                    }),
                  },
                  {
                    // Merged into Inventory's "Incoming Stock" tab (2026-09-28); old links still work.
                    path: "incoming",
                    element: <Navigate to="../inventory?tab=incoming" replace />,
                  },
                  {
                    path: "agent",
                    lazy: async () => ({
                      Component: (await import("./pages/AgentPage")).default,
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
    ],
  },
];

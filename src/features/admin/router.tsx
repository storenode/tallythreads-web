import { Navigate, type RouteObject } from "react-router-dom";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { RequireArea } from "@/features/auth/RequireArea";
import ConsoleShell from "@/layouts/console/ConsoleShell";
import { adminNav } from "./nav";

export const adminRoutes: RouteObject[] = [
  {
    path: "/admin",
    element: <AuthGuard />,
    children: [
      {
        element: <RequireArea area="admin" />,
        children: [
          {
            element: <ConsoleShell nav={adminNav} />,
            children: [
              {
                index: true,
                lazy: async () => ({
                  Component: (await import("./dashboard/admin.home")).default,
                }),
              },
              {
                // Bare /admin/setup starts a brand-new organization.
                path: "setup",
                element: <Navigate to="/admin/setup/new" replace />,
              },
              {
                path: "setup/new",
                lazy: async () => ({
                  Component: (
                    await import("./setup/steps/CreateOrganizationStep")
                  ).default,
                }),
              },
              {
                path: "setup/:orgId",
                lazy: async () => ({
                  Component: (await import("./setup/SetupWizardLayout")).default,
                }),
                children: [
                  {
                    index: true,
                    lazy: async () => ({
                      Component: (await import("./setup/SetupWizardLayout"))
                        .SetupIndexRedirect,
                    }),
                  },
                  {
                    path: "organization",
                    lazy: async () => ({
                      Component: (
                        await import("./setup/steps/OrganizationStep")
                      ).default,
                    }),
                  },
                  {
                    path: "stores",
                    lazy: async () => ({
                      Component: (await import("./setup/steps/StoresStep"))
                        .default,
                    }),
                  },
                  {
                    path: "stock-setup",
                    lazy: async () => ({
                      Component: (await import("./setup/steps/StockSetupStep"))
                        .default,
                    }),
                  },
                  {
                    path: "go-live",
                    lazy: async () => ({
                      Component: (await import("./setup/steps/GoLiveStep"))
                        .default,
                    }),
                  },
                ],
              },
              {
                path: "organizations",
                lazy: async () => ({
                  Component: (
                    await import("./organizations/OrganizationsDirectoryPage")
                  ).default,
                }),
              },
              {
                path: "roles",
                lazy: async () => ({
                  Component: (await import("./roles/RolesPage")).default,
                }),
              },
              {
                path: "demo",
                lazy: async () => ({
                  Component: (await import("./demo")).default,
                }),
              },
            ],
          },
        ],
      },
    ],
  },
];

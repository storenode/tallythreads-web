import type { RouteObject } from "react-router-dom";
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
                path: "organizations",
                lazy: async () => ({
                  Component: (
                    await import("./organizations/OrganizationListPage")
                  ).default,
                }),
              },
              {
                path: "organizations/new",
                lazy: async () => ({
                  Component: (await import("./organizations/OrganizationForm"))
                    .default,
                }),
              },
              {
                path: "organizations/:orgId/edit",
                lazy: async () => ({
                  Component: (await import("./organizations/OrganizationForm"))
                    .OrganizationEditPage,
                }),
              },
              {
                path: "roles",
                lazy: async () => ({
                  Component: (await import("./roles/RolesPage")).default,
                }),
              },
            ],
          },
        ],
      },
    ],
  },
];

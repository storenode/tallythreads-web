import { Navigate, type RouteObject } from "react-router-dom";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { RequireArea } from "@/features/auth/RequireArea";
import { RequireOrgAccess } from "@/features/auth/RequireOrgAccess";
import OrgConsoleLayout from "./OrgConsoleLayout";

export const storeRoutes: RouteObject[] = [
  {
    path: "/org",
    element: <AuthGuard />,
    children: [
      {
        element: <RequireArea area="org" />,
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import("./OrgPickerPage")).default,
            }),
          },
          {
            path: ":orgId",
            element: <RequireOrgAccess />,
            children: [
              {
                element: <OrgConsoleLayout />,
                children: [
                  { index: true, element: <Navigate to="stores" replace /> },
                  {
                    path: "stores",
                    lazy: async () => ({
                      Component: (await import("./pages/StoresListPage")).default,
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

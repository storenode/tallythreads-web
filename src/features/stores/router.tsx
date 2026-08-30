import { Navigate, type RouteObject } from "react-router-dom";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { RequireArea } from "@/features/auth/RequireArea";
import ConsoleShell from "@/layouts/console/ConsoleShell";
import { orgNav } from "./nav";

export const storeRoutes: RouteObject[] = [
  {
    path: "/org",
    element: <AuthGuard />,
    children: [
      {
        element: <RequireArea area="org" />,
        children: [
          {
            element: <ConsoleShell nav={orgNav} />,
            children: [
              {
                index: true,
                element: <Navigate to="/org/stores" replace />,
              },
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
];

import type { RouteObject } from "react-router-dom";
import { AuthGuard } from "@/features/auth/AuthGuard";

export const adminRoutes: RouteObject[] = [
  {
    path: "/admin",
    element: <AuthGuard />,
    children: [
      {
        lazy: async () => ({
          Component: (await import("./components/AdminLayout")).default,
        }),
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import("./pages/admin.home")).default,
            }),
          },
        ],
      },
    ],
  },
];

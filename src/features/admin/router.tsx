import type { RouteObject } from "react-router-dom";
import { AuthGuard } from "@/features/auth/AuthGuard";

export const adminRoutes: RouteObject[] = [
  {
    // Platform-admin console — see the redirect decision in
    // src/features/auth/resolvePostSignInPath.ts. AdminShell (header + sidenav) is
    // this feature's own layout, distinct from AppShell (bottom tabs, store-scoped
    // screens) since platform admin isn't scoped to a store at all.
    path: "/admin",
    element: <AuthGuard />,
    children: [
      {
        lazy: async () => ({
          Component: (await import("./AdminShell")).AdminShell,
        }),
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import("./AdminPage")).default,
            }),
          },
        ],
      },
    ],
  },
];

import type { RouteObject } from "react-router-dom";
import { AuthGuard } from "@/features/auth/AuthGuard";

export const adminRoutes: RouteObject[] = [
  {
    // Platform-admin landing page — see the redirect decision in
    // src/features/auth/resolvePostSignInPath.ts. Static placeholder until the real
    // admin console (organization provisioning, etc.) is built.
    path: "/admin",
    element: <AuthGuard />,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import("./AdminPage")).default,
        }),
      },
    ],
  },
];

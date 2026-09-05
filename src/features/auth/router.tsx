import type { RouteObject } from "react-router-dom";
import { AuthGuard } from "@/features/auth/AuthGuard";

export const authRoutes: RouteObject[] = [
  {
    path: "/auth/callback",
    lazy: async () => ({
      Component: (await import("./AuthCallbackPage")).default,
    }),
  },
  {
    // Unified sign-in destination (PIN + Google fallback) — see
    // specs/tasks/M1a-identity-auth.md Task 3. Replaces the old standalone /auth/pin.
    path: "/login",
    lazy: async () => ({
      Component: (await import("./LoginPage")).default,
    }),
  },
  {
    // Public demo launch link — redeems a grant token from the URL hash into a member
    // session (no Google/PIN). Intentionally not behind AuthGuard: the opener has no
    // session yet. See DemoLaunchPage + the demo-login edge function.
    path: "/demo/launch",
    lazy: async () => ({
      Component: (await import("./DemoLaunchPage")).default,
    }),
  },
  {
    // Requires a signed-in member (just came from Google or PIN sign-in) — AuthGuard
    // reads the cached active member, offline-capable like the /app/* guard.
    path: "/auth/set-pin",
    element: <AuthGuard />,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import("./SetPinPage")).default,
        }),
      },
    ],
  },
  {
    path: "/no-store",
    element: <AuthGuard />,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import("./NoStoreAssignedPage")).default,
        }),
      },
    ],
  },
  {
    // Reached when resolvePostSignInPath sees more than one accessible area (Admin
    // console / Organization / Store Operations) — lets the member choose instead of
    // one area silently winning. See LaunchPage.tsx.
    path: "/launch",
    element: <AuthGuard />,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import("./LaunchPage")).default,
        }),
      },
    ],
  },
];

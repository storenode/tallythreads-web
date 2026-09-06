import { Navigate, useParams, type RouteObject } from "react-router-dom";
import { AuthGuard } from "@/features/auth/AuthGuard";
import { RequireArea } from "@/features/auth/RequireArea";
import { RequireOrgAccess } from "@/features/auth/RequireOrgAccess";
import ConsoleShell from "@/layouts/console/ConsoleShell";
import { getOrgAdminNav } from "./nav";

// Wrapper so the nav can carry the current :orgId into its link targets.
function OrgAdminShell() {
  const { orgId } = useParams<{ orgId: string }>();
  return <ConsoleShell nav={getOrgAdminNav(orgId ?? "")} />;
}

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
                element: <OrgAdminShell />,
                children: [
                  { index: true, element: <Navigate to="stores" replace /> },
                  {
                    path: "stores",
                    lazy: async () => ({
                      Component: (await import("./pages/StoresListPage"))
                        .default,
                    }),
                  },
                  {
                    path: "stores/new",
                    lazy: async () => ({
                      Component: (await import("./pages/StoreCreatePage"))
                        .default,
                    }),
                  },
                  {
                    path: "stores/:storeId/edit",
                    lazy: async () => ({
                      Component: (await import("./pages/StoreEditPage"))
                        .default,
                    }),
                  },
                  {
                    path: "stores/:storeId/members/new",
                    lazy: async () => ({
                      Component: (await import("./pages/StoreMemberCreatePage"))
                        .default,
                    }),
                  },
                  {
                    path: "stores/:storeId/members/:memberId/edit",
                    lazy: async () => ({
                      Component: (await import("./pages/StoreMemberEditPage"))
                        .default,
                    }),
                  },
                  {
                    // Org self-service profile edit — reuses the admin edit
                    // form, minus the archive flow, gated by RequireArea "org"
                    // + RequireOrgAccess instead of "admin".
                    path: "edit",
                    lazy: async () => ({
                      Component: (await import("./pages/OrgProfilePage"))
                        .default,
                    }),
                  },
                  {
                    path: "members/new",
                    lazy: async () => ({
                      Component: (await import("./pages/OrgMemberCreatePage"))
                        .default,
                    }),
                  },
                  {
                    path: "members/:memberId/edit",
                    lazy: async () => ({
                      Component: (await import("./pages/OrgMemberEditPage"))
                        .default,
                    }),
                  },
                  {
                    path: "purchase-trips",
                    lazy: async () => ({
                      Component: (
                        await import(
                          "../purchaseTrips/pages/PurchaseTripsListPage"
                        )
                      ).default,
                    }),
                  },
                  {
                    path: "purchase-trips/new",
                    lazy: async () => ({
                      Component: (
                        await import(
                          "../purchaseTrips/pages/PurchaseTripCreatePage"
                        )
                      ).default,
                    }),
                  },
                  {
                    path: "purchase-trips/:tripLocalId",
                    lazy: async () => ({
                      Component: (
                        await import(
                          "../purchaseTrips/pages/PurchaseTripDetailPage"
                        )
                      ).default,
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

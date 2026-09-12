import { type RouteObject } from "react-router-dom";

export const purchaseTripRoutes: RouteObject[] = [
  {
    path: "purchase-trips",
    lazy: async () => ({
      Component: (await import("./pages/PurchaseTripsListPage")).default,
    }),
  },
  {
    path: "purchase-trips/new",
    lazy: async () => ({
      Component: (await import("./pages/PurchaseTripCreatePage")).default,
    }),
  },
  {
    path: "purchase-trips/:tripLocalId",
    lazy: async () => ({
      Component: (await import("./pages/PurchaseTripDetailPage")).default,
    }),
  },
  {
    path: "deliveries",
    lazy: async () => ({
      Component: (await import("./pages/DeliveriesPage")).default,
    }),
  },
  {
    path: "deliveries/:invoiceLocalId",
    lazy: async () => ({
      Component: (await import("./pages/DeliveryDetailPage")).default,
    }),
  },
];

import { type RouteObject } from "react-router-dom";

/** Org-console inventory routes, mounted under /org/:orgId (see stores/router.tsx). */
export const inventoryRoutes: RouteObject[] = [
  {
    path: "inventory",
    lazy: async () => ({
      Component: (await import("./pages/OrgInventoryPage")).default,
    }),
  },
  {
    // Catalogue one Ready-for-Inventory invoice (Phase 2B).
    path: "inventory/invoices/:invoiceLocalId",
    lazy: async () => ({
      Component: (await import("./pages/CataloguePage")).default,
    }),
  },
];

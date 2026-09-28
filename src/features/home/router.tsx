import type { RouteObject } from "react-router-dom";

export const homeRoutes: RouteObject[] = [
  {
    path: "/",
    lazy: async () => ({
      Component: (await import("./HomePage")).default,
    }),
  },
  {
    // Public item page a label's QR code opens (features/inventory/codes.ts → skuLookupUrl).
    path: "/s/:sku",
    lazy: async () => ({
      Component: (await import("./SkuPage")).default,
    }),
  },
];

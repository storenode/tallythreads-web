import { z } from "zod";
import { STORE_CODE_RE, normalizeStoreCode } from "@/features/inventory/codes";

/**
 * Store code field for every store form: typed in any case, stored uppercase (BND-KDP).
 * Required because it is the first segment of the store's SKUs / barcodes
 * (specs/roadmap/inventory.md §5).
 */
export const storeCodeSchema = z.preprocess(
  (v) => normalizeStoreCode(String(v ?? "")),
  z
    .string()
    .regex(
      STORE_CODE_RE,
      "Store code is required — 2–12 letters, numbers or \"-\" (e.g. BND-KDP). It's printed in barcodes.",
    ),
);

export const STORE_CODE_HINT = "Used in barcodes, e.g. BND-KDP-SAR-RED-FREE-0042.";

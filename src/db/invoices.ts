import type { SyncMeta } from "./types";

export interface Invoice extends SyncMeta {
  id?: string;
  store_id: string;
  /** {store_code}-{device_id}-{local_sequence} — never a central counter (§6) */
  invoice_no: string;
  total_paise: number;
}

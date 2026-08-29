import type { SyncMeta } from "./types";

export interface Product extends SyncMeta {
  id?: string;
  store_id: string;
  name: string;
  hsn_code: string | null;
}

import type { SyncMeta } from "./types";

export type TripExpenseCategory =
  | "travel"
  | "lodging"
  | "food"
  | "transport"
  | "other";

export interface TripExpense extends SyncMeta {
  id?: string;
  trip_id: string;
  category: TripExpenseCategory;
  amount_paise: number;
  note: string | null;
}

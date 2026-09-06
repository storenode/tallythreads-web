import { db } from "@/db";
import type { TripExpense, SyncMeta } from "@/db";
import { createRow, softDeleteRow, updateRow } from "./writeThrough";

const TABLE = "trip_expenses";

export function createTripExpense(data: Omit<TripExpense, keyof SyncMeta>) {
  return createRow(TABLE, db.trip_expenses, data);
}

export function updateTripExpense(
  localId: string,
  changes: Partial<Omit<TripExpense, keyof SyncMeta>>,
) {
  return updateRow(TABLE, db.trip_expenses, localId, changes);
}

export function deleteTripExpense(localId: string) {
  return softDeleteRow(TABLE, db.trip_expenses, localId);
}

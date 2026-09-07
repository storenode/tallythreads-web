import { db } from "@/db";
import type { TripActivity, SyncMeta } from "@/db";
import { createRow, softDeleteRow, updateRow } from "./writeThrough";

const TABLE = "trip_activities";

export function createTripActivity(data: Omit<TripActivity, keyof SyncMeta>) {
  return createRow(TABLE, db.trip_activities, data);
}

export function updateTripActivity(
  localId: string,
  changes: Partial<Omit<TripActivity, keyof SyncMeta>>,
) {
  return updateRow(TABLE, db.trip_activities, localId, changes);
}

export function deleteTripActivity(localId: string) {
  return softDeleteRow(TABLE, db.trip_activities, localId);
}

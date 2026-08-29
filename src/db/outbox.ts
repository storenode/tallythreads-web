export interface OutboxItem {
  id?: number;
  table: string;
  localId: string;
  op: "insert" | "update" | "delete";
  queued_at: string;
  attempts: number;
}

import * as z from 'zod';
import { readOperations, type LocalStore } from './store.ts';

export function discardOperations(
  store: LocalStore,
  operationIds: string[],
): number {
  const selected = new Set(operationIds);
  const operations = readOperations(store).filter((entry) =>
    selected.has(entry.operation.operationId),
  );
  const discardedAt = new Date().toISOString();
  const statement = store.db.prepare(
    `INSERT INTO discarded_operations
     (discarded_at, operation_id, operation_json, failure_json)
     VALUES (?, ?, ?, ?)`,
  );
  for (const entry of operations)
    statement.run(
      discardedAt,
      entry.operation.operationId,
      JSON.stringify(entry.operation),
      entry.failure === null ? null : JSON.stringify(entry.failure),
    );
  const remove = store.db.prepare('DELETE FROM outbox WHERE operation_id = ?');
  for (const entry of operations) remove.run(entry.operation.operationId);
  store.db
    .prepare('UPDATE binding SET last_error_json = NULL WHERE singleton = 1')
    .run();
  return operations.length;
}

export function readDiscardedOperations(store: LocalStore): unknown[] {
  const rows = store.db
    .prepare(
      `SELECT discarded_at, operation_id, operation_json, failure_json
       FROM discarded_operations ORDER BY id`,
    )
    .all();
  return z
    .array(
      z.object({
        discarded_at: z.string(),
        operation_id: z.string(),
        operation_json: z.string(),
        failure_json: z.string().nullable(),
      }),
    )
    .parse(rows)
    .map((row) => ({
      discardedAt: row.discarded_at,
      operationId: row.operation_id,
      operation: JSON.parse(row.operation_json),
      failure: row.failure_json === null ? null : JSON.parse(row.failure_json),
    }));
}

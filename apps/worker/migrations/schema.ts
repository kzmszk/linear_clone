import type {
  DurableObjectStorage,
  SqlStorage,
} from '@cloudflare/workers-types';
import initialSchema from './001_initial.sql';

export function initializeSchema(
  sql: SqlStorage,
  storage: DurableObjectStorage,
): void {
  storage.transactionSync(() => {
    for (const statement of initialSchema.split(';')) {
      const trimmed = statement.trim();
      if (trimmed.length > 0) sql.exec(trimmed);
    }
    migrateWorkflowStates(sql);
  });
}

function migrateWorkflowStates(sql: SqlStorage): void {
  const columns = sql
    .exec<{ name: string }>('PRAGMA table_info(workflow_states)')
    .toArray();
  if (columns.some((column) => column.name === 'archived_at')) return;
  sql.exec('ALTER TABLE workflow_states ADD COLUMN archived_at TEXT');
}

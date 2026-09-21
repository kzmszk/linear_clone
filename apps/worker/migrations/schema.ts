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
  });
}

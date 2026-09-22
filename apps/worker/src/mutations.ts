import { conflict } from './errors.ts';
import { now, one } from './db.ts';
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type {
  AppliedMutation,
  AuthActor,
  MutationReceipt,
  MutationResponse,
  SqlDb,
} from './types.ts';

type OperationRow = {
  request_hash: string;
  workspace_id: string | null;
  entity_id: string;
  version: number;
  sequence: number;
};

export type MutationOptions<T> = {
  sql: SqlDb;
  storage: DurableObjectStorage;
  actor: AuthActor;
  operationId: string;
  requestHash: string;
  workspaceId: string | null;
  authorize: () => void;
  apply: () => AppliedMutation<T>;
  current: (entityId: string) => T | null;
};

export function actorKey(actor: AuthActor): string {
  return `${actor.issuer}:${actor.subject}`;
}

export function runMutation<T>(
  options: MutationOptions<T>,
): MutationResponse<T> {
  return options.storage.transactionSync(() => {
    options.authorize();
    const key = actorKey(options.actor);
    const existing = one<OperationRow>(
      options.sql,
      'SELECT request_hash, workspace_id, entity_id, version, sequence FROM operations WHERE actor_key = ? AND operation_id = ?',
      key,
      options.operationId,
    );
    if (existing) {
      if (
        existing.request_hash !== options.requestHash ||
        existing.workspace_id !== options.workspaceId
      ) {
        throw conflict(
          'idempotency_reused',
          'Idempotency key was used for another request',
        );
      }
      const current = options.current(existing.entity_id);
      if (current === null) {
        throw conflict(
          'receipt_unavailable',
          'The receipt target is no longer available',
        );
      }
      return {
        kind: 'replayed',
        receipt: receiptFromRow(options.operationId, existing),
        current,
      };
    }

    const applied = options.apply();
    const sequence = nextSequence(options.sql);
    const createdAt = now();
    options.sql.exec(
      `INSERT INTO changes (sequence, workspace_id, entity_kind, entity_id, version, actor_key, operation_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      sequence,
      options.workspaceId,
      applied.entityKind,
      applied.entityId,
      applied.version,
      key,
      options.operationId,
      JSON.stringify(applied.payload),
      createdAt,
    );
    options.sql.exec(
      `INSERT INTO operations (actor_key, operation_id, request_hash, entity_kind, entity_id, version, sequence, workspace_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      key,
      options.operationId,
      options.requestHash,
      applied.entityKind,
      applied.entityId,
      applied.version,
      sequence,
      options.workspaceId,
      createdAt,
    );
    return {
      kind: 'committed',
      receipt: {
        operationId: options.operationId,
        entityId: applied.entityId,
        version: applied.version,
        sequence,
      },
      current: applied.current,
    };
  });
}

function nextSequence(sql: SqlDb): number {
  sql.exec(
    'UPDATE installation_settings SET sequence = sequence + 1 WHERE id = 1',
  );
  const row = one<{ sequence: number }>(
    sql,
    'SELECT sequence FROM installation_settings WHERE id = 1',
  );
  if (row === null)
    throw new Error('installation settings were not initialized');
  return row.sequence;
}

function receiptFromRow(
  operationId: string,
  row: OperationRow,
): MutationReceipt {
  return {
    operationId,
    entityId: row.entity_id,
    version: row.version,
    sequence: row.sequence,
  };
}

export function hashPayload(payload: unknown): Promise<string> {
  return crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)))
    .then((digest) => {
      return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
    });
}

export function requireOperationId(value: string | null): string {
  if (value === null || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) {
    throw conflict('missing_idempotency_key', 'Idempotency-Key must be a UUID');
  }
  return value;
}

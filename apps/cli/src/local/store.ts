import { chmod } from 'node:fs/promises';
import * as z from 'zod';
import {
  bindingSchema,
  localFailureSchema,
  parseCommentView,
  parseIssueView,
  parseSnapshot,
  parseStoredOperation,
  type LocalBinding,
  type LocalComment,
  type LocalFailure,
  type LocalIssue,
  type Projection,
  type StoredOperation,
} from './model.ts';
import type {
  SyncOperation,
  SyncSnapshot,
} from '../../../../packages/contracts/src/sync.ts';

type DatabaseSync = import('node:sqlite').DatabaseSync;
export type LocalStore = { path: string; db: DatabaseSync };

const schema = `
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS binding (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    url TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    workspace_slug TEXT NOT NULL,
    issuer TEXT NOT NULL,
    subject TEXT NOT NULL,
    email TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    last_sync_at TEXT,
    last_error_json TEXT
  );
  CREATE TABLE IF NOT EXISTS snapshot (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    snapshot_json TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS outbox (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id TEXT NOT NULL UNIQUE,
    operation_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    failure_json TEXT
  );
  CREATE TABLE IF NOT EXISTS issue_view (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    record_json TEXT NOT NULL,
    sync_state TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS issue_view_order
    ON issue_view(updated_at DESC, id DESC);
  CREATE TABLE IF NOT EXISTS comment_view (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    record_json TEXT NOT NULL,
    sync_state TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS comment_view_issue
    ON comment_view(issue_id, created_at, id);
  CREATE TABLE IF NOT EXISTS discarded_operations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discarded_at TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    operation_json TEXT NOT NULL,
    failure_json TEXT
  );
`;

const bindingRowSchema = z.object({
  url: z.string(),
  workspace_id: z.string(),
  workspace_slug: z.string(),
  issuer: z.string(),
  subject: z.string(),
  email: z.string(),
  sequence: z.number(),
  last_sync_at: z.string().nullable(),
  last_error_json: z.string().nullable(),
});

let sqliteModule: Promise<typeof import('node:sqlite')> | undefined;

async function sqlite() {
  return (sqliteModule ??= import('node:sqlite'));
}

export async function openStore(path: string): Promise<LocalStore> {
  const { DatabaseSync } = await sqlite();
  const db = new DatabaseSync(path);
  try {
    db.exec(schema);
    await chmod(path, 0o600);
    return { path, db };
  } catch (error) {
    db.close();
    throw error;
  }
}

export async function openReadOnlyStore(path: string): Promise<LocalStore> {
  const { DatabaseSync } = await sqlite();
  return { path, db: new DatabaseSync(path, { readOnly: true }) };
}

export function closeStore(store: LocalStore): void {
  store.db.close();
}

export function transaction<T>(store: LocalStore, action: () => T): T {
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    store.db.exec('COMMIT');
    return result;
  } catch (error) {
    store.db.exec('ROLLBACK');
    throw error;
  }
}

export function readBinding(store: LocalStore): LocalBinding {
  const value = store.db
    .prepare('SELECT * FROM binding WHERE singleton = 1')
    .get();
  const row = bindingRowSchema.parse(value);
  return bindingSchema.parse({
    url: row.url,
    workspaceId: row.workspace_id,
    workspaceSlug: row.workspace_slug,
    issuer: row.issuer,
    subject: row.subject,
    email: row.email,
    sequence: row.sequence,
    lastSyncAt: row.last_sync_at,
    lastError:
      row.last_error_json === null
        ? null
        : localFailureSchema.parse(JSON.parse(row.last_error_json)),
  });
}

export function readSnapshot(store: LocalStore): SyncSnapshot {
  const row = z
    .object({ snapshot_json: z.string() })
    .parse(
      store.db
        .prepare('SELECT snapshot_json FROM snapshot WHERE singleton = 1')
        .get(),
    );
  return parseSnapshot(row.snapshot_json);
}

export function readOperations(store: LocalStore): StoredOperation[] {
  return store.db
    .prepare(
      'SELECT sequence, operation_json, created_at, failure_json FROM outbox ORDER BY sequence',
    )
    .all()
    .map(parseStoredOperation);
}

export function readIssues(store: LocalStore): LocalIssue[] {
  return store.db
    .prepare(
      'SELECT record_json, sync_state FROM issue_view ORDER BY updated_at DESC, id DESC',
    )
    .all()
    .map(parseIssueView);
}

export function readComments(
  store: LocalStore,
  issueId: string,
): LocalComment[] {
  return store.db
    .prepare(
      'SELECT record_json, sync_state FROM comment_view WHERE issue_id = ? ORDER BY created_at, id',
    )
    .all(issueId)
    .map(parseCommentView);
}

export function initializeStore(
  store: LocalStore,
  binding: LocalBinding,
  snapshot: SyncSnapshot,
  projection: Projection,
): void {
  transaction(store, () => {
    if (hasBinding(store))
      throw new Error('Local workspace is already initialized.');
    writeBinding(store, binding);
    writeSnapshot(store, snapshot, null);
    writeProjection(store, projection);
  });
}

function hasBinding(store: LocalStore): boolean {
  return (
    store.db
      .prepare('SELECT 1 AS present FROM binding WHERE singleton = 1')
      .get() !== undefined
  );
}

function writeBinding(store: LocalStore, binding: LocalBinding): void {
  store.db
    .prepare(
      `INSERT INTO binding
       (singleton, url, workspace_id, workspace_slug, issuer, subject, email,
        sequence, last_sync_at, last_error_json)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      binding.url,
      binding.workspaceId,
      binding.workspaceSlug,
      binding.issuer,
      binding.subject,
      binding.email,
      binding.sequence,
      binding.lastSyncAt,
      binding.lastError === null ? null : JSON.stringify(binding.lastError),
    );
}

export function writeSnapshot(
  store: LocalStore,
  snapshot: SyncSnapshot,
  failure: LocalFailure | null,
): void {
  const now = new Date().toISOString();
  store.db
    .prepare(
      `INSERT INTO snapshot (singleton, snapshot_json) VALUES (1, ?)
       ON CONFLICT(singleton) DO UPDATE SET snapshot_json = excluded.snapshot_json`,
    )
    .run(JSON.stringify(snapshot));
  store.db
    .prepare(
      `UPDATE binding SET workspace_slug = ?, email = ?, sequence = ?,
       last_sync_at = ?, last_error_json = ? WHERE singleton = 1`,
    )
    .run(
      snapshot.workspace.slug,
      snapshot.principal.email,
      snapshot.sequence,
      now,
      failure === null ? null : JSON.stringify(failure),
    );
}

export function writeSyncState(
  store: LocalStore,
  sequence: number,
  failure: LocalFailure | null,
): void {
  store.db
    .prepare(
      `UPDATE binding SET sequence = ?, last_sync_at = ?, last_error_json = ?
       WHERE singleton = 1`,
    )
    .run(
      sequence,
      new Date().toISOString(),
      failure === null ? null : JSON.stringify(failure),
    );
}

export function appendOperation(
  store: LocalStore,
  operation: SyncOperation,
  createdAt: string,
): void {
  store.db
    .prepare(
      'INSERT INTO outbox (operation_id, operation_json, created_at) VALUES (?, ?, ?)',
    )
    .run(operation.operationId, JSON.stringify(operation), createdAt);
}

export function acknowledgeOperations(
  store: LocalStore,
  operationIds: string[],
): void {
  const statement = store.db.prepare(
    'DELETE FROM outbox WHERE operation_id = ?',
  );
  for (const operationId of operationIds) statement.run(operationId);
}

export function recordFailure(
  store: LocalStore,
  failure: LocalFailure | null,
): void {
  if (failure === null) return;
  store.db
    .prepare('UPDATE outbox SET failure_json = ? WHERE operation_id = ?')
    .run(JSON.stringify(failure), failure.operationId);
}

export function writeProjection(store: LocalStore, value: Projection): void {
  store.db.exec('DELETE FROM issue_view; DELETE FROM comment_view;');
  const issueStatement = store.db.prepare(
    'INSERT INTO issue_view (id, identifier, updated_at, record_json, sync_state) VALUES (?, ?, ?, ?, ?)',
  );
  for (const issue of value.issues) {
    const { syncState, ...record } = issue;
    issueStatement.run(
      issue.id,
      issue.identifier,
      issue.updatedAt,
      JSON.stringify(record),
      syncState,
    );
  }
  const commentStatement = store.db.prepare(
    'INSERT INTO comment_view (id, issue_id, created_at, record_json, sync_state) VALUES (?, ?, ?, ?, ?)',
  );
  for (const comment of value.comments) {
    const { syncState, ...record } = comment;
    commentStatement.run(
      comment.id,
      comment.issueId,
      comment.createdAt,
      JSON.stringify(record),
      syncState,
    );
  }
}

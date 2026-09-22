import { badRequest } from '../errors.ts';
import { one } from '../db.ts';
import type { SqlDb, SqlRow } from '../types.ts';
import type { ImportBatch, ImportItem, SourceIdentity } from './types.ts';

export type UnknownRecord = { readonly [key: string]: unknown };

export function record(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function text(value: unknown, key: string): string | null {
  const item = record(value)?.[key];
  return typeof item === 'string' ? item : null;
}

export function numberValue(value: unknown, key: string): number | null {
  const item = record(value)?.[key];
  return typeof item === 'number' && Number.isFinite(item) ? item : null;
}

export function booleanValue(value: unknown, key: string): boolean {
  return record(value)?.[key] === true;
}

export function nestedId(value: unknown, key: string): string | null {
  const direct = text(value, key);
  return direct ?? text(record(value)?.[key], 'id');
}

export function nestedIds(value: unknown, key: string): string[] {
  const nested = record(value)?.[key];
  const nodes = record(nested)?.nodes ?? nested;
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((item) => {
    const id = typeof item === 'string' ? item : text(item, 'id');
    return id === null ? [] : [id];
  });
}

export function sourceTime(
  value: unknown,
  key: string,
  fallback: string,
): string {
  return text(value, key) ?? fallback;
}

function identity(value: unknown): SourceIdentity | null {
  const sourceId = text(value, 'id');
  const name = text(value, 'name') ?? text(value, 'displayName');
  if (sourceId === null || name === null) return null;
  return { provider: 'linear', sourceId, name, email: text(value, 'email') };
}

export function saveIdentity(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  value: unknown,
): void {
  const sourceIdentity = identity(value);
  if (sourceIdentity === null) return;
  sql.exec(
    'INSERT OR REPLACE INTO source_identities (workspace_id, provider, source_workspace_id, source_id, name, email) VALUES (?, ?, ?, ?, ?, ?)',
    workspaceId,
    batch.provider,
    batch.sourceWorkspaceId,
    sourceIdentity.sourceId,
    sourceIdentity.name,
    sourceIdentity.email,
  );
}

export function saveItemIdentity(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
): void {
  if (item.sourceIdentity === undefined) return;
  sql.exec(
    'INSERT OR REPLACE INTO source_identities (workspace_id, provider, source_workspace_id, source_id, name, email) VALUES (?, ?, ?, ?, ?, ?)',
    workspaceId,
    batch.provider,
    batch.sourceWorkspaceId,
    item.sourceIdentity.sourceId,
    item.sourceIdentity.name,
    item.sourceIdentity.email,
  );
}

export function sourceDestination(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  kind: string,
  sourceId: string | null,
): string | null {
  if (sourceId === null) return null;
  const row = one<{ destination_id: string | null } & SqlRow>(
    sql,
    'SELECT destination_id FROM source_records WHERE workspace_id = ? AND provider = ? AND source_workspace_id = ? AND kind = ? AND source_id = ? ORDER BY source_revision DESC LIMIT 1',
    workspaceId,
    batch.provider,
    batch.sourceWorkspaceId,
    kind,
    sourceId,
  );
  return row?.destination_id ?? null;
}

export function requireDestination(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  kind: string,
  sourceId: string | null,
  context: string,
): string {
  if (sourceId === null) throw badRequest(`${context} is missing a source ID`);
  const destination = sourceDestination(
    sql,
    workspaceId,
    batch,
    kind,
    sourceId,
  );
  if (destination === null)
    throw badRequest(`${context} references unresolved ${kind} ${sourceId}`);
  return destination;
}

export function invalidItem(item: ImportItem, message: string): never {
  throw badRequest(`Import ${item.sourceId}: ${message}`);
}

export function jsonValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

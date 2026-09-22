import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { now, one } from '../db.ts';
import { runMutation } from '../mutations.ts';
import { requireManager } from '../organization/authentication.ts';
import type { AuthActor, MutationResponse, SqlDb, SqlRow } from '../types.ts';
import {
  normalizeImportedItem,
  resolveImportedReferences,
} from './normalize.ts';
import {
  importCurrent,
  importRun,
  sourceRecord,
  unresolvedRecords,
  type ImportResult,
} from './status.ts';
import type { ImportBatch, ImportItem } from './types.ts';

export function applyImportBatch(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  operationId: string,
  requestHash: string,
  batch: ImportBatch,
  items: ImportItem[],
): MutationResponse<ImportResult> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => requireManager(sql, actor, workspaceId),
    apply: () => applyBatch(sql, workspaceId, batch, items, actor),
    current: (entityId) => importCurrent(sql, entityId),
  });
}

function applyBatch(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  items: ImportItem[],
  actor: AuthActor,
): {
  entityKind: string;
  entityId: string;
  version: number;
  current: ImportResult;
  payload: Record<string, string | number | boolean | null>;
} {
  const timestamp = now();
  let run = importRun(sql, batch.runId);
  if (run === null) {
    sql.exec(
      'INSERT INTO import_runs (id, workspace_id, provider, source_workspace_id, kind, version, applied_count, skipped_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, 0, ?, ?)',
      batch.runId,
      workspaceId,
      batch.provider,
      batch.sourceWorkspaceId,
      batch.kind,
      timestamp,
      timestamp,
    );
    run = importRun(sql, batch.runId);
  }
  if (run === null || run.workspace_id !== workspaceId)
    throw new Error('import run could not be created');
  if (
    run.provider !== batch.provider ||
    run.source_workspace_id !== batch.sourceWorkspaceId
  )
    throw new Error('Import run belongs to another source workspace');
  const counts = applySourceRecords(
    sql,
    workspaceId,
    batch,
    items,
    timestamp,
    actor,
  );
  const version = run.version + 1;
  sql.exec(
    'UPDATE import_runs SET kind = ?, version = ?, applied_count = applied_count + ?, skipped_count = skipped_count + ?, updated_at = ? WHERE id = ?',
    batch.kind,
    version,
    counts.applied,
    counts.skipped,
    timestamp,
    batch.runId,
  );
  return {
    entityKind: 'import.run',
    entityId: batch.runId,
    version,
    current: {
      runId: batch.runId,
      kind: batch.kind,
      applied: counts.applied,
      skipped: counts.skipped,
      version,
      records: counts.records,
      unresolved: counts.unresolved,
    },
    payload: {
      kind: batch.kind,
      applied: counts.applied,
      skipped: counts.skipped,
    },
  };
}

function applySourceRecords(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  items: ImportItem[],
  timestamp: string,
  actor: AuthActor,
): {
  applied: number;
  skipped: number;
  records: ImportResult['records'];
  unresolved: string[];
} {
  const fresh: ImportItem[] = [];
  let skipped = 0;
  for (const item of items) {
    const existing = one<{ source_id: string; payload_hash: string } & SqlRow>(
      sql,
      'SELECT source_id, payload_hash FROM source_records WHERE workspace_id = ? AND provider = ? AND source_workspace_id = ? AND kind = ? AND source_id = ? AND source_revision = ?',
      workspaceId,
      batch.provider,
      batch.sourceWorkspaceId,
      batch.kind,
      item.sourceId,
      item.sourceRevision,
    );
    if (existing !== null) {
      if (existing.payload_hash !== item.payloadHash)
        throw new Error(
          `Import payload hash changed for ${batch.kind}:${item.sourceId}`,
        );
      skipped += 1;
      continue;
    }
    sql.exec(
      'INSERT INTO source_records (workspace_id, provider, source_workspace_id, kind, source_id, source_revision, payload_hash, payload_json, source_identity_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      workspaceId,
      batch.provider,
      batch.sourceWorkspaceId,
      batch.kind,
      item.sourceId,
      item.sourceRevision,
      item.payloadHash,
      JSON.stringify(item.payload),
      item.sourceIdentity === undefined
        ? null
        : JSON.stringify(item.sourceIdentity),
      timestamp,
    );
    fresh.push(item);
  }
  for (const item of fresh)
    applyFreshSource(sql, workspaceId, batch, item, actor);
  resolveImportedReferences(sql, workspaceId, batch);
  const records = items.map((item) =>
    sourceRecord(sql, workspaceId, batch, item),
  );
  const unresolved = unresolvedRecords(sql, workspaceId, batch, items);
  return { applied: fresh.length, skipped, records, unresolved };
}

function applyFreshSource(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
  actor: AuthActor,
): void {
  const prior = one<{ destination_id: string | null } & SqlRow>(
    sql,
    'SELECT destination_id FROM source_records WHERE workspace_id = ? AND provider = ? AND source_workspace_id = ? AND kind = ? AND source_id = ? AND source_revision != ? AND destination_id IS NOT NULL ORDER BY source_revision DESC LIMIT 1',
    workspaceId,
    batch.provider,
    batch.sourceWorkspaceId,
    batch.kind,
    item.sourceId,
    item.sourceRevision,
  );
  const destinationId =
    prior?.destination_id ??
    normalizeImportedItem(sql, workspaceId, batch, item, actor);
  if (destinationId === null) return;
  sql.exec(
    'UPDATE source_records SET destination_id = ? WHERE workspace_id = ? AND provider = ? AND source_workspace_id = ? AND kind = ? AND source_id = ? AND source_revision = ?',
    destinationId,
    workspaceId,
    batch.provider,
    batch.sourceWorkspaceId,
    batch.kind,
    item.sourceId,
    item.sourceRevision,
  );
}

export function withPayloadHashes(
  batch: ImportBatch,
  hashes: string[],
): ImportItem[] {
  return batch.items.map((item, index) => ({
    ...item,
    payloadHash: hashes[index] ?? '',
  }));
}

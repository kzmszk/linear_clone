import { one } from '../db.ts';
import { notFound } from '../errors.ts';
import { requireManager } from '../organization/authentication.ts';
import type { ImportVerifyInput } from '../../../../packages/contracts/src/index.ts';
import type { AuthActor, SqlDb, SqlRow } from '../types.ts';
import type { ImportBatch, ImportItem } from './types.ts';
import { importedFiles } from './file-status.ts';
import type { ImportedFile } from './file-status.ts';

export type { ImportedFile } from './file-status.ts';

export type ImportRun = {
  id: string;
  workspace_id: string;
  provider: string;
  source_workspace_id: string;
  kind: string;
  version: number;
  applied_count: number;
  skipped_count: number;
  created_at: string;
  updated_at: string;
} & SqlRow;

export type ImportRecord = {
  kind: string;
  sourceId: string;
  sourceRevision: string;
  payloadHash: string;
  destinationId: string | null;
};

export type ImportResult = {
  runId: string;
  kind: string;
  applied: number;
  skipped: number;
  version: number;
  records: ImportRecord[];
  unresolved: string[];
};

export function importRun(sql: SqlDb, runId: string): ImportRun | null {
  return one<ImportRun>(sql, 'SELECT * FROM import_runs WHERE id = ?', runId);
}

export function importCurrent(sql: SqlDb, runId: string): ImportResult | null {
  const run = importRun(sql, runId);
  return run === null
    ? null
    : {
        runId: run.id,
        kind: run.kind,
        applied: run.applied_count,
        skipped: run.skipped_count,
        version: run.version,
        records: importRunRecords(
          sql,
          run.workspace_id,
          run.provider,
          run.source_workspace_id,
        ),
        unresolved: unresolvedAll(
          sql,
          run.workspace_id,
          run.provider,
          run.source_workspace_id,
        ),
      };
}

export function listImportRuns(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
): ImportResult[] {
  requireManager(sql, actor, workspaceId);
  return sql
    .exec<ImportRun>(
      'SELECT * FROM import_runs WHERE workspace_id = ? ORDER BY updated_at DESC, id DESC',
      workspaceId,
    )
    .toArray()
    .map((run) => importCurrent(sql, run.id))
    .filter((result): result is ImportResult => result !== null);
}

export function getImportRun(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  runId: string,
): ImportResult {
  requireManager(sql, actor, workspaceId);
  const run = importRun(sql, runId);
  if (run === null || run.workspace_id !== workspaceId) throw notFound();
  const result = importCurrent(sql, runId);
  if (result === null) throw notFound();
  return result;
}

export function verifyImport(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  input: ImportVerifyInput,
): {
  runId: string;
  records: number;
  kinds: Record<string, number>;
  mappings: ImportRecord[];
  files: ImportedFile[];
  unresolved: string[];
} {
  requireManager(sql, actor, workspaceId);
  const run = importRun(sql, input.runId);
  if (
    run === null ||
    run.workspace_id !== workspaceId ||
    run.provider !== input.provider ||
    run.source_workspace_id !== input.sourceWorkspaceId
  )
    return {
      runId: input.runId,
      records: 0,
      kinds: {},
      mappings: [],
      files: [],
      unresolved: [],
    };
  const records = sql
    .exec<{ kind: string; count: number } & SqlRow>(
      'SELECT kind, COUNT(*) AS count FROM source_records WHERE workspace_id = ? AND provider = ? AND source_workspace_id = ? GROUP BY kind',
      workspaceId,
      input.provider,
      input.sourceWorkspaceId,
    )
    .toArray();
  return {
    runId: input.runId,
    records: records.reduce((sum, item) => sum + item.count, 0),
    kinds: Object.fromEntries(records.map((item) => [item.kind, item.count])),
    mappings: importRunRecords(
      sql,
      workspaceId,
      input.provider,
      input.sourceWorkspaceId,
    ),
    files: importedFiles(
      sql,
      workspaceId,
      input.provider,
      input.sourceWorkspaceId,
    ),
    unresolved: unresolvedAll(
      sql,
      workspaceId,
      input.provider,
      input.sourceWorkspaceId,
    ),
  };
}

type ImportRecordRow = SqlRow & {
  kind: string;
  source_id: string;
  source_revision: string;
  payload_hash: string;
  destination_id: string | null;
};

export function sourceRecord(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
): ImportRecord {
  const row = one<ImportRecordRow>(
    sql,
    'SELECT kind, source_id, source_revision, payload_hash, destination_id FROM source_records WHERE workspace_id = ? AND provider = ? AND source_workspace_id = ? AND kind = ? AND source_id = ? AND source_revision = ?',
    workspaceId,
    batch.provider,
    batch.sourceWorkspaceId,
    batch.kind,
    item.sourceId,
    item.sourceRevision,
  );
  if (row === null) throw new Error('import source record disappeared');
  return recordSummary(row);
}

export function unresolvedRecords(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  items: ImportItem[],
): string[] {
  const unresolved = items
    .filter(
      (item) =>
        batch.kind !== 'member' &&
        sourceRecord(sql, workspaceId, batch, item).destinationId === null,
    )
    .map((item) => `${batch.kind}:${item.sourceId}`);
  return unresolved.concat(
    unresolvedParentReferences(
      sql,
      workspaceId,
      batch.provider,
      batch.sourceWorkspaceId,
    ),
  );
}

function recordSummary(row: ImportRecordRow): ImportRecord {
  return {
    kind: row.kind,
    sourceId: row.source_id,
    sourceRevision: row.source_revision,
    payloadHash: row.payload_hash,
    destinationId: row.destination_id,
  };
}

function importRunRecords(
  sql: SqlDb,
  workspaceId: string,
  provider: string,
  sourceWorkspaceId: string,
): ImportRecord[] {
  return sql
    .exec<ImportRecordRow>(
      'SELECT kind, source_id, source_revision, payload_hash, destination_id FROM source_records WHERE workspace_id = ? AND provider = ? AND source_workspace_id = ? ORDER BY kind, source_id, source_revision',
      workspaceId,
      provider,
      sourceWorkspaceId,
    )
    .toArray()
    .map(recordSummary);
}

function unresolvedAll(
  sql: SqlDb,
  workspaceId: string,
  provider: string,
  sourceWorkspaceId: string,
): string[] {
  const rows = sql
    .exec<{ kind: string; source_id: string } & SqlRow>(
      "SELECT kind, source_id FROM source_records WHERE workspace_id = ? AND provider = ? AND source_workspace_id = ? AND destination_id IS NULL AND kind != 'member'",
      workspaceId,
      provider,
      sourceWorkspaceId,
    )
    .toArray();
  return rows
    .map((row) => `${row.kind}:${row.source_id}`)
    .concat(
      unresolvedParentReferences(sql, workspaceId, provider, sourceWorkspaceId),
    );
}

function unresolvedParentReferences(
  sql: SqlDb,
  workspaceId: string,
  provider: string,
  sourceWorkspaceId: string,
): string[] {
  const issues = sql
    .exec<{ source_id: string } & SqlRow>(
      "SELECT DISTINCT i.source_id FROM issues i JOIN source_records sr ON sr.destination_id = i.id AND sr.kind = 'issue' WHERE i.workspace_id = ? AND sr.provider = ? AND sr.source_workspace_id = ? AND i.source_parent_issue_id IS NOT NULL",
      workspaceId,
      provider,
      sourceWorkspaceId,
    )
    .toArray()
    .map((row) => `issue-parent:${row.source_id}`);
  const comments = sql
    .exec<{ id: string } & SqlRow>(
      "SELECT DISTINCT c.id FROM comments c JOIN source_records sr ON sr.destination_id = c.id AND sr.kind = 'comment' WHERE c.workspace_id = ? AND sr.provider = ? AND sr.source_workspace_id = ? AND c.source_parent_comment_id IS NOT NULL",
      workspaceId,
      provider,
      sourceWorkspaceId,
    )
    .toArray()
    .map((row) => `comment-parent:${row.id}`);
  return [...issues, ...comments].map(
    (value) => `${provider}:${sourceWorkspaceId}:${value}`,
  );
}

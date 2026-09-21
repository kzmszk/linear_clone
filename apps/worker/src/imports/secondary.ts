import { newId } from '../db.ts';
import {
  invalidItem,
  nestedId,
  record,
  requireDestination,
  saveIdentity,
  sourceTime,
  text,
  jsonValue,
} from './values.ts';
import type { ImportBatch, ImportItem } from './types.ts';
import type { SqlDb } from '../types.ts';

export function normalizeSecondary(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
): string {
  switch (batch.kind) {
    case 'relation':
      return normalizeRelation(sql, workspaceId, batch, item);
    case 'history':
      return normalizeHistory(sql, workspaceId, batch, item);
    case 'attachment':
      return normalizeAttachment(sql, workspaceId, batch, item);
    default: {
      invalidItem(item, `secondary normalizer cannot handle ${batch.kind}`);
    }
  }
}

function normalizeRelation(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
): string {
  const issueSourceId =
    text(item.payload, 'issueId') ?? nestedId(item.payload, 'issue');
  const relatedSourceId = nestedId(item.payload, 'relatedIssue');
  const issueId = requireDestination(
    sql,
    workspaceId,
    batch,
    'issue',
    issueSourceId,
    'relation issue',
  );
  const relatedIssueId = requireDestination(
    sql,
    workspaceId,
    batch,
    'issue',
    relatedSourceId,
    'related issue',
  );
  if (issueId === relatedIssueId)
    invalidItem(item, 'relation cannot point to the same issue');
  const type = text(item.payload, 'type');
  if (type === null) invalidItem(item, 'relation type is required');
  const relationId = newId();
  const timestamp = sourceTime(
    item.payload,
    'createdAt',
    new Date().toISOString(),
  );
  sql.exec(
    'INSERT INTO issue_relations (id, workspace_id, issue_id, related_issue_id, relation_type, source_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    relationId,
    workspaceId,
    issueId,
    relatedIssueId,
    type,
    item.sourceId,
    timestamp,
    sourceTime(item.payload, 'updatedAt', timestamp),
  );
  return relationId;
}

function normalizeHistory(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
): string {
  const issueSourceId =
    text(item.payload, 'issueId') ?? nestedId(item.payload, 'issue');
  const issueId = requireDestination(
    sql,
    workspaceId,
    batch,
    'issue',
    issueSourceId,
    'history issue',
  );
  const actor = record(item.payload)?.actor;
  saveIdentity(sql, workspaceId, batch, actor);
  const actorName =
    text(actor, 'name') ??
    text(actor, 'displayName') ??
    text(item.payload, 'actorId') ??
    'Imported user';
  const action = historyAction(item.payload);
  const timestamp = sourceTime(
    item.payload,
    'createdAt',
    new Date().toISOString(),
  );
  const activityId = `import-${batch.sourceWorkspaceId}-${item.sourceId}`;
  sql.exec(
    'INSERT OR IGNORE INTO activities (id, workspace_id, issue_id, actor, action, created_at, source, source_id) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
    activityId,
    workspaceId,
    issueId,
    actorName,
    action,
    timestamp,
    item.sourceId,
  );
  return activityId;
}

function historyAction(payload: unknown): string {
  const changes = record(payload)?.changes;
  if (changes !== null && changes !== undefined) {
    const keys = Object.keys(changes);
    if (keys.length > 0) return `history:${keys.sort().join(',')}`;
  }
  if (record(payload)?.archived === true) return 'archived';
  if (record(payload)?.trashed === true) return 'trashed';
  return 'updated';
}

function normalizeAttachment(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
): string {
  const issueSourceId =
    text(item.payload, 'issueId') ?? nestedId(item.payload, 'issue');
  const issueId = requireDestination(
    sql,
    workspaceId,
    batch,
    'issue',
    issueSourceId,
    'attachment issue',
  );
  const title =
    text(item.payload, 'title') ??
    text(item.payload, 'subtitle') ??
    item.sourceId;
  const timestamp = sourceTime(
    item.payload,
    'createdAt',
    new Date().toISOString(),
  );
  const attachmentId = newId();
  sql.exec(
    'INSERT INTO issue_attachments (id, workspace_id, issue_id, title, subtitle, url, metadata_json, source, source_type, source_id, file_json, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    attachmentId,
    workspaceId,
    issueId,
    title,
    text(item.payload, 'subtitle'),
    text(item.payload, 'url'),
    jsonValue(record(item.payload)?.metadata),
    text(item.payload, 'source'),
    text(item.payload, 'sourceType'),
    item.sourceId,
    jsonValue(item.file),
    timestamp,
    sourceTime(item.payload, 'updatedAt', timestamp),
    text(item.payload, 'archivedAt'),
  );
  rewriteInlineLinks(
    sql,
    workspaceId,
    issueId,
    text(item.payload, 'url'),
    text(item.file, 'destinationUrl'),
  );
  return attachmentId;
}

function rewriteInlineLinks(
  sql: SqlDb,
  workspaceId: string,
  issueId: string,
  sourceUrl: string | null,
  destinationUrl: string | null,
): void {
  if (
    sourceUrl === null ||
    destinationUrl === null ||
    sourceUrl === destinationUrl
  )
    return;
  sql.exec(
    'UPDATE issues SET description = REPLACE(description, ?, ?) WHERE id = ? AND workspace_id = ? AND description IS NOT NULL',
    sourceUrl,
    destinationUrl,
    issueId,
    workspaceId,
  );
  sql.exec(
    'UPDATE comments SET body = REPLACE(body, ?, ?) WHERE issue_id = ? AND workspace_id = ?',
    sourceUrl,
    destinationUrl,
    issueId,
    workspaceId,
  );
}

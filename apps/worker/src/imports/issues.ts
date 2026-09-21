import { newId, one } from '../db.ts';
import type { SqlDb, SqlRow } from '../types.ts';
import {
  invalidItem,
  nestedId,
  nestedIds,
  numberValue,
  record,
  requireDestination,
  saveIdentity,
  sourceDestination,
  sourceTime,
  text,
} from './values.ts';
import { ensureIssueState } from './organization.ts';
import type { ImportBatch, ImportItem } from './types.ts';

export function normalizeIssue(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
  timestamp: string,
): string {
  const teamId = requireDestination(
    sql,
    workspaceId,
    batch,
    'team',
    nestedId(item.payload, 'team'),
    'issue team',
  );
  const title = text(item.payload, 'title');
  if (title === null) invalidItem(item, 'issue title is required');
  const stateId = ensureIssueState(
    sql,
    workspaceId,
    batch,
    item,
    teamId,
    timestamp,
  );
  const projectId = destinationOrNull(
    sql,
    workspaceId,
    batch,
    'project',
    nestedId(item.payload, 'project'),
    'issue project',
  );
  const parentSourceId = nestedId(item.payload, 'parent');
  const parentId = sourceDestination(
    sql,
    workspaceId,
    batch,
    'issue',
    parentSourceId,
  );
  const issueNumber = chooseIssueNumber(
    sql,
    teamId,
    numberValue(item.payload, 'number'),
  );
  const issueId = newId();
  const assignee = record(item.payload)?.assignee;
  saveIdentity(sql, workspaceId, batch, assignee);
  saveIdentity(sql, workspaceId, batch, record(item.payload)?.creator);
  updateIssueCounter(sql, teamId, issueNumber);
  sql.exec(
    'INSERT INTO issues (id, workspace_id, team_id, issue_number, title, description, state_id, priority, assignee_id, project_id, parent_id, estimate, due_date, source_assignee_id, source_assignee_name, source_parent_issue_id, version, created_at, updated_at, archived_at, deleted_at, completed_at, canceled_at, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)',
    issueId,
    workspaceId,
    teamId,
    issueNumber,
    title,
    text(item.payload, 'description'),
    stateId,
    numberValue(item.payload, 'priority') ?? 0,
    projectId,
    parentId,
    numberValue(item.payload, 'estimate'),
    text(item.payload, 'dueDate'),
    text(assignee, 'id'),
    text(assignee, 'name') ?? text(assignee, 'displayName'),
    parentId === null ? parentSourceId : null,
    sourceTime(item.payload, 'createdAt', timestamp),
    sourceTime(item.payload, 'updatedAt', timestamp),
    text(item.payload, 'archivedAt'),
    text(item.payload, 'deletedAt') ?? text(item.payload, 'trashedAt'),
    text(item.payload, 'completedAt'),
    text(item.payload, 'canceledAt'),
    item.sourceId,
  );
  addIssueLabels(sql, workspaceId, batch, item, issueId);
  return issueId;
}

function updateIssueCounter(
  sql: SqlDb,
  teamId: string,
  issueNumber: number,
): void {
  sql.exec(
    'UPDATE teams SET next_issue_number = CASE WHEN next_issue_number <= ? THEN ? ELSE next_issue_number END WHERE id = ?',
    issueNumber,
    issueNumber + 1,
    teamId,
  );
}

function addIssueLabels(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
  issueId: string,
): void {
  for (const sourceLabelId of nestedIds(item.payload, 'labels')) {
    const labelId = requireDestination(
      sql,
      workspaceId,
      batch,
      'label',
      sourceLabelId,
      'issue label',
    );
    sql.exec(
      'INSERT OR IGNORE INTO issue_labels (issue_id, label_id) VALUES (?, ?)',
      issueId,
      labelId,
    );
  }
}

function chooseIssueNumber(
  sql: SqlDb,
  teamId: string,
  sourceNumber: number | null,
): number {
  const current = one<{ next_issue_number: number } & SqlRow>(
    sql,
    'SELECT next_issue_number FROM teams WHERE id = ?',
    teamId,
  );
  if (current === null) throw new Error('Imported issue team disappeared');
  if (sourceNumber === null || sourceNumber < 1)
    return current.next_issue_number;
  const collision = one<{ id: string } & SqlRow>(
    sql,
    'SELECT id FROM issues WHERE team_id = ? AND issue_number = ?',
    teamId,
    sourceNumber,
  );
  if (collision !== null)
    throw new Error(
      `Imported issue number ${sourceNumber} conflicts in team ${teamId}`,
    );
  return sourceNumber;
}

function normalizeComment(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
  timestamp: string,
): string {
  const issueSourceId =
    text(item.payload, 'issueId') ?? nestedId(item.payload, 'issue');
  const issueId = requireDestination(
    sql,
    workspaceId,
    batch,
    'issue',
    issueSourceId,
    'comment issue',
  );
  const body = text(item.payload, 'body') ?? text(item.payload, 'bodyData');
  if (body === null) invalidItem(item, 'comment body is required');
  const user = record(item.payload)?.user ?? record(item.payload)?.author;
  saveIdentity(sql, workspaceId, batch, user);
  const parentSourceId =
    text(item.payload, 'parentId') ?? nestedId(item.payload, 'parent');
  const parentId = sourceDestination(
    sql,
    workspaceId,
    batch,
    'comment',
    parentSourceId,
  );
  const commentId = newId();
  sql.exec(
    'INSERT INTO comments (id, workspace_id, issue_id, body, author_id, author_name, source_author_id, source_parent_comment_id, parent_comment_id, version, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 1, ?, ?)',
    commentId,
    workspaceId,
    issueId,
    body,
    text(user, 'name') ?? text(user, 'displayName') ?? 'Imported user',
    text(user, 'id'),
    parentSourceId,
    parentId,
    sourceTime(item.payload, 'createdAt', timestamp),
    sourceTime(item.payload, 'updatedAt', timestamp),
  );
  return commentId;
}

function destinationOrNull(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  kind: string,
  sourceId: string | null,
  context: string,
): string | null {
  if (sourceId === null) return null;
  return requireDestination(sql, workspaceId, batch, kind, sourceId, context);
}

export function normalizeIssueOrComment(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
  timestamp: string,
): string {
  return batch.kind === 'issue'
    ? normalizeIssue(sql, workspaceId, batch, item, timestamp)
    : normalizeComment(sql, workspaceId, batch, item, timestamp);
}

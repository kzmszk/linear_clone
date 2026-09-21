import { one, parseBoolean, rows } from '../db.ts';
import { badRequest, notFound } from '../errors.ts';
import {
  canAccessTeam,
  requireMembership,
  requireTeamAccess,
} from '../organization/authentication.ts';
import { activityRecord, commentRecord, issueRecord } from './records.ts';
import { z } from 'zod';
import {
  activitySchema,
  commentSchema,
  issuePageSchema,
  issueSchema,
} from '../../../../packages/contracts/src/index.ts';
import type {
  ActivityRow,
  AuthActor,
  CommentRow,
  IssueRow,
  SqlDb,
  SqlRow,
} from '../types.ts';
type Activity = z.infer<typeof activitySchema>;
type Comment = z.infer<typeof commentSchema>;
type Issue = z.infer<typeof issueSchema>;
type IssuePage = z.infer<typeof issuePageSchema>;

export function getIssue(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
): Issue {
  requireMembership(sql, actor, workspaceId);
  const row = issueRow(sql, issueId);
  if (row === null || row.workspace_id !== workspaceId) throw notFound();
  requireTeamAccess(sql, actor, row.team_id);
  return issueRecord(row, issueLabelIds(sql, issueId));
}

export function listIssues(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  url: URL,
): IssuePage {
  const user = requireMembership(sql, actor, workspaceId);
  const teamId = url.searchParams.get('teamId');
  if (teamId !== null && !canAccessTeam(sql, user.user_id, teamId))
    throw notFound();
  const deleted = parseBoolean(url.searchParams.get('deleted'), false);
  const archived = parseBoolean(url.searchParams.get('archived'), false);
  const conditions = [
    'i.workspace_id = ?',
    deleted ? 'i.deleted_at IS NOT NULL' : 'i.deleted_at IS NULL',
    archived ? 'i.archived_at IS NOT NULL' : 'i.archived_at IS NULL',
  ];
  const bindings: SqlStorageValue[] = [workspaceId];
  appendFilter(conditions, bindings, 'i.team_id', teamId);
  appendFilter(
    conditions,
    bindings,
    'i.project_id',
    url.searchParams.get('projectId'),
  );
  appendFilter(
    conditions,
    bindings,
    'i.state_id',
    url.searchParams.get('stateId'),
  );
  appendFilter(
    conditions,
    bindings,
    'i.assignee_id',
    url.searchParams.get('assigneeId'),
  );
  const query = url.searchParams.get('q');
  if (query !== null && query.length > 0) {
    conditions.push(
      "(i.title LIKE ? OR t.team_key || '-' || i.issue_number LIKE ?)",
    );
    bindings.push(`%${query}%`, `%${query}%`);
  }
  conditions.push(
    '(t.private = 0 OR EXISTS (SELECT 1 FROM team_memberships tm WHERE tm.team_id = i.team_id AND tm.user_id = ?))',
  );
  bindings.push(user.user_id);
  const cursor = parseCursor(url.searchParams.get('cursor'));
  if (cursor) {
    conditions.push('(i.updated_at < ? OR (i.updated_at = ? AND i.id < ?))');
    bindings.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
  }
  const page = rows<IssueRow>(
    sql,
    `SELECT i.*, t.team_key, COALESCE(u.name, i.source_assignee_name) AS assignee_name FROM issues i JOIN teams t ON t.id = i.team_id LEFT JOIN users u ON u.id = i.assignee_id WHERE ${conditions.join(' AND ')} ORDER BY i.updated_at DESC, i.id DESC LIMIT 201`,
    ...bindings,
  );
  const visible = page.slice(0, 200);
  const last = visible.at(-1);
  return {
    items: visible.map((row) => issueRecord(row, issueLabelIds(sql, row.id))),
    cursor:
      page.length > 200 && last
        ? btoa(JSON.stringify({ updatedAt: last.updated_at, id: last.id }))
        : null,
  };
}

export function listComments(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
): Comment[] {
  const issue = issueRow(sql, issueId);
  if (issue === null || issue.workspace_id !== workspaceId) throw notFound();
  requireTeamAccess(sql, actor, issue.team_id);
  return rows<CommentRow>(
    sql,
    'SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at, id',
    issueId,
  ).map(commentRecord);
}

export function listActivity(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
): Activity[] {
  const issue = issueRow(sql, issueId);
  if (issue === null || issue.workspace_id !== workspaceId) throw notFound();
  requireTeamAccess(sql, actor, issue.team_id);
  return rows<ActivityRow>(
    sql,
    'SELECT * FROM activities WHERE issue_id = ? ORDER BY created_at, id',
    issueId,
  ).map(activityRecord);
}

export function issueRow(sql: SqlDb, issueId: string): IssueRow | null {
  return one<IssueRow>(
    sql,
    'SELECT i.*, t.team_key, COALESCE(u.name, i.source_assignee_name) AS assignee_name FROM issues i JOIN teams t ON t.id = i.team_id LEFT JOIN users u ON u.id = i.assignee_id WHERE i.id = ?',
    issueId,
  );
}

export function issueCurrent(sql: SqlDb, issueId: string): Issue | null {
  const row = issueRow(sql, issueId);
  return row === null ? null : issueRecord(row, issueLabelIds(sql, issueId));
}

export function issueLabelIds(sql: SqlDb, issueId: string): string[] {
  return rows<{ label_id: string } & SqlRow>(
    sql,
    'SELECT label_id FROM issue_labels WHERE issue_id = ? ORDER BY label_id',
    issueId,
  ).map((row) => row.label_id);
}

function appendFilter(
  conditions: string[],
  bindings: SqlStorageValue[],
  column: string,
  value: string | null,
): void {
  if (value === null) return;
  conditions.push(`${column} = ?`);
  bindings.push(value);
}

const cursorSchema = z.object({ updatedAt: z.string(), id: z.string().uuid() });

function parseCursor(
  value: string | null,
): z.infer<typeof cursorSchema> | null {
  if (value === null) return null;
  try {
    return cursorSchema.parse(JSON.parse(atob(value)));
  } catch {
    throw badRequest('Invalid issue cursor');
  }
}

import { one, rows } from '../db.ts';
import { badRequest, notFound } from '../errors.ts';
import {
  canAccessTeam,
  requireMembership,
  requireTeamAccess,
} from '../organization/authentication.ts';
import { activityRecord, commentRecord, issueRecord } from './records.ts';
import { resolveIssueListReferences } from './references.ts';
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
import type { IssueListFilter } from './inputs.ts';
type Activity = z.infer<typeof activitySchema>;
type Comment = z.infer<typeof commentSchema>;
type Issue = z.infer<typeof issueSchema>;
type IssuePage = z.infer<typeof issuePageSchema>;

export function getIssue(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  issueReference: string,
): Issue {
  requireMembership(sql, actor, workspaceId);
  const row = issueRowByReference(sql, workspaceId, issueReference);
  if (row === null) throw notFound();
  requireTeamAccess(sql, actor, row.team_id);
  return issueRecord(row, issueLabelIds(sql, row.id));
}

export function listIssues(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  input: IssueListFilter,
): IssuePage {
  const user = requireMembership(sql, actor, workspaceId);
  const filter = resolveIssueListReferences(sql, actor, workspaceId, input);
  const teamId = filter.teamId;
  if (teamId !== null && !canAccessTeam(sql, user.user_id, teamId))
    throw notFound();
  const conditions = [
    'i.workspace_id = ?',
    filter.deleted ? 'i.deleted_at IS NOT NULL' : 'i.deleted_at IS NULL',
    filter.archived ? 'i.archived_at IS NOT NULL' : 'i.archived_at IS NULL',
  ];
  const bindings: SqlStorageValue[] = [workspaceId];
  appendLifecycleFilter(conditions, filter.lifecycle);
  appendFilter(conditions, bindings, 'i.team_id', teamId);
  appendFilter(conditions, bindings, 'i.project_id', filter.projectId);
  appendFilter(conditions, bindings, 'i.state_id', filter.stateId);
  appendFilter(conditions, bindings, 'i.assignee_id', filter.assigneeId);
  const query = filter.query;
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
  const cursor = parseCursor(filter.cursor);
  if (cursor) {
    conditions.push('(i.updated_at < ? OR (i.updated_at = ? AND i.id < ?))');
    bindings.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
  }
  const page = rows<IssueRow>(
    sql,
    `SELECT i.*, t.team_key, COALESCE(u.name, i.source_assignee_name) AS assignee_name FROM issues i JOIN teams t ON t.id = i.team_id JOIN workflow_states ws ON ws.id = i.state_id LEFT JOIN users u ON u.id = i.assignee_id WHERE ${conditions.join(' AND ')} ORDER BY i.updated_at DESC, i.id DESC LIMIT 201`,
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

export function getComment(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
  commentId: string,
): Comment {
  const issue = issueRow(sql, issueId);
  if (issue === null || issue.workspace_id !== workspaceId) throw notFound();
  requireTeamAccess(sql, actor, issue.team_id);
  const comment = one<CommentRow>(
    sql,
    'SELECT * FROM comments WHERE id = ? AND issue_id = ?',
    commentId,
    issueId,
  );
  if (comment === null) throw notFound();
  return commentRecord(comment);
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

function issueRowByReference(
  sql: SqlDb,
  workspaceId: string,
  reference: string,
): IssueRow | null {
  const byId = one<IssueRow>(
    sql,
    'SELECT i.*, t.team_key, COALESCE(u.name, i.source_assignee_name) AS assignee_name FROM issues i JOIN teams t ON t.id = i.team_id LEFT JOIN users u ON u.id = i.assignee_id WHERE i.workspace_id = ? AND i.id = ?',
    workspaceId,
    reference,
  );
  if (byId !== null) return byId;
  const match = /^([a-z][a-z0-9]{0,9})-([1-9][0-9]*)$/iu.exec(reference);
  if (match === null) return null;
  return one<IssueRow>(
    sql,
    `SELECT i.*, t.team_key, COALESCE(u.name, i.source_assignee_name) AS assignee_name
     FROM issues i JOIN teams t ON t.id = i.team_id
     LEFT JOIN users u ON u.id = i.assignee_id
     WHERE i.workspace_id = ? AND lower(t.team_key) = lower(?) AND i.issue_number = ?`,
    workspaceId,
    match[1],
    Number(match[2]),
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

function appendLifecycleFilter(
  conditions: string[],
  lifecycle: IssueListFilter['lifecycle'],
): void {
  if (lifecycle === 'open')
    conditions.push("ws.type NOT IN ('completed', 'canceled')");
  if (lifecycle === 'closed')
    conditions.push("ws.type IN ('completed', 'canceled')");
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

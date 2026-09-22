import { one, rows } from '../db.ts';
import { requireMembership } from '../organization/authentication.ts';
import { getMetadata, getWorkspace } from '../organization/queries.ts';
import { commentRecord, issueRecord } from '../issues/records.ts';
import { issueLabelIds } from '../issues/queries.ts';
import type {
  SyncResponse,
  SyncSnapshot,
} from '../../../../packages/contracts/src/sync.ts';
import type {
  AuthActor,
  CommentRow,
  IssueRow,
  SqlDb,
  SqlRow,
} from '../types.ts';

export type SyncIdentity = Pick<
  SyncResponse,
  'principal' | 'workspaceId' | 'sequence'
>;

export function readSyncIdentity(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
): SyncIdentity {
  requireMembership(sql, actor, workspaceId);
  return {
    principal: {
      issuer: actor.issuer,
      subject: actor.subject,
      email: actor.email,
    },
    workspaceId,
    sequence: currentSequence(sql),
  };
}

export function buildSyncSnapshot(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
): SyncSnapshot {
  const membership = requireMembership(sql, actor, workspaceId);
  const issues = listVisibleIssues(sql, workspaceId, membership.user_id);
  return {
    principal: {
      issuer: actor.issuer,
      subject: actor.subject,
      email: actor.email,
    },
    workspace: getWorkspace(sql, actor, workspaceId),
    metadata: getMetadata(sql, actor, workspaceId),
    issues,
    comments: listVisibleComments(sql, workspaceId, membership.user_id),
    sequence: currentSequence(sql),
  };
}

function listVisibleIssues(sql: SqlDb, workspaceId: string, userId: string) {
  return rows<IssueRow>(
    sql,
    `SELECT i.*, t.team_key,
       COALESCE(u.name, i.source_assignee_name) AS assignee_name
     FROM issues i
     JOIN teams t ON t.id = i.team_id
     LEFT JOIN users u ON u.id = i.assignee_id
     WHERE i.workspace_id = ?
       AND (t.private = 0 OR EXISTS (
         SELECT 1 FROM team_memberships tm
         WHERE tm.team_id = i.team_id AND tm.user_id = ?
       ))
     ORDER BY i.updated_at DESC, i.id DESC`,
    workspaceId,
    userId,
  ).map((row) => issueRecord(row, issueLabelIds(sql, row.id)));
}

function listVisibleComments(sql: SqlDb, workspaceId: string, userId: string) {
  return rows<CommentRow>(
    sql,
    `SELECT c.*
     FROM comments c
     JOIN issues i ON i.id = c.issue_id AND i.workspace_id = c.workspace_id
     JOIN teams t ON t.id = i.team_id
     WHERE c.workspace_id = ?
       AND (t.private = 0 OR EXISTS (
         SELECT 1 FROM team_memberships tm
         WHERE tm.team_id = i.team_id AND tm.user_id = ?
       ))
     ORDER BY c.created_at, c.id`,
    workspaceId,
    userId,
  ).map(commentRecord);
}

function currentSequence(sql: SqlDb): number {
  const row = one<{ sequence: number } & SqlRow>(
    sql,
    'SELECT sequence FROM installation_settings WHERE id = 1',
  );
  if (row === null)
    throw new Error('installation settings were not initialized');
  return row.sequence;
}

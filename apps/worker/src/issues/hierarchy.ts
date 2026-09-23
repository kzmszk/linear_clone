import { one, rows } from '../db.ts';
import {
  canAccessTeam,
  requireMembership,
} from '../organization/authentication.ts';
import type { AuthActor, SqlDb, SqlRow } from '../types.ts';
import { getIssue } from './queries.ts';
import type { z } from 'zod';
import type {
  issueHierarchySchema,
  issueLinkSchema,
} from '../../../../packages/contracts/src/index.ts';

type IssueLink = z.infer<typeof issueLinkSchema>;
type IssueHierarchy = z.infer<typeof issueHierarchySchema>;
type LinkRow = SqlRow & {
  id: string;
  team_id: string;
  team_key: string;
  issue_number: number;
  title: string;
  state_id: string;
  version: number;
  archived_at: string | null;
  deleted_at: string | null;
};

export function getIssueHierarchy(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
): IssueHierarchy {
  const issue = getIssue(sql, actor, workspaceId, issueId);
  const member = requireMembership(sql, actor, workspaceId);
  const parent = issue.parentId
    ? one<LinkRow>(sql, linkQuery('i.id = ?'), issue.parentId, workspaceId)
    : null;
  const children = rows<LinkRow>(
    sql,
    `${linkQuery(`i.parent_id = ? AND (t.private = 0 OR EXISTS (
      SELECT 1 FROM team_memberships tm
      WHERE tm.team_id = i.team_id AND tm.user_id = ?
    ))`)} ORDER BY i.created_at, i.id`,
    issue.id,
    member.user_id,
    workspaceId,
  );
  return {
    parent:
      parent && canAccessTeam(sql, member.user_id, parent.team_id)
        ? issueLink(parent)
        : null,
    children: children.map(issueLink),
  };
}

function linkQuery(condition: string): string {
  return `SELECT i.id, i.team_id, t.team_key, i.issue_number, i.title,
    i.state_id, i.version, i.archived_at, i.deleted_at
    FROM issues i JOIN teams t ON t.id = i.team_id
    WHERE ${condition} AND i.workspace_id = ?`;
}

function issueLink(row: LinkRow): IssueLink {
  return {
    id: row.id,
    identifier: `${row.team_key}-${row.issue_number}`,
    title: row.title,
    teamId: row.team_id,
    stateId: row.state_id,
    version: row.version,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
  };
}

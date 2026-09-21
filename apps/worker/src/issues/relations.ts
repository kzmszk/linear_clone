import { rows } from '../db.ts';
import { canAccessTeam, requireUser } from '../organization/authentication.ts';
import { getIssue } from './queries.ts';
import type { AuthActor, SqlDb, SqlRow } from '../types.ts';

type RelationRow = SqlRow & {
  id: string;
  relation_type: string;
  issue_id: string;
  team_id: string;
  team_key: string;
  issue_number: number;
  title: string;
  source_issue_id: string;
};

export function listRelations(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
) {
  getIssue(sql, actor, workspaceId, issueId);
  const user = requireUser(sql, actor);
  return rows<RelationRow>(
    sql,
    `SELECT r.id, r.relation_type, r.issue_id AS source_issue_id, i.id AS issue_id,
      i.team_id, t.team_key, i.issue_number, i.title FROM issue_relations r
      JOIN issues i ON i.id = CASE WHEN r.issue_id = ? THEN r.related_issue_id ELSE r.issue_id END
      JOIN teams t ON t.id = i.team_id
      WHERE r.workspace_id = ? AND (r.issue_id = ? OR r.related_issue_id = ?)
      ORDER BY r.created_at, r.id`,
    issueId,
    workspaceId,
    issueId,
    issueId,
  )
    .filter((row) => canAccessTeam(sql, user.id, row.team_id))
    .map((row) => ({
      id: row.id,
      type: row.relation_type,
      issueId: row.issue_id,
      identifier: `${row.team_key}-${row.issue_number}`,
      title: row.title,
      direction: row.source_issue_id === issueId ? 'outgoing' : 'incoming',
    }));
}

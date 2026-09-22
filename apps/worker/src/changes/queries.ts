import { badRequest } from '../errors.ts';
import { one, rows } from '../db.ts';
import {
  canAccessTeam,
  requireMembership,
} from '../organization/authentication.ts';
import { issueRow } from '../issues/queries.ts';
import type { AuthActor, SqlDb, SqlRow } from '../types.ts';

type Change = {
  sequence: number;
  entityKind: string;
  entityId: string;
  version: number;
  operationId: string;
};
export type ChangePage = { items: Change[]; cursor: number | null };
export type ChangeRow = SqlRow & {
  sequence: number;
  entity_kind: string;
  entity_id: string;
  version: number;
  operation_id: string;
};

export function listChanges(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  url: URL,
): ChangePage {
  const membership = requireMembership(sql, actor, workspaceId);
  const cursor = parseCursor(url.searchParams.get('cursor'));
  const rowsFound = rows<ChangeRow>(
    sql,
    'SELECT sequence, entity_kind, entity_id, version, operation_id FROM changes WHERE workspace_id = ? AND sequence > ? ORDER BY sequence LIMIT 201',
    workspaceId,
    cursor,
  );
  const visible = rowsFound.filter((row) =>
    canSeeChange(sql, membership.user_id, row),
  );
  const items = visible.slice(0, 200).map(changeRecord);
  const hasMore = rowsFound.length > 200;
  return {
    items,
    cursor: hasMore
      ? (items.at(-1)?.sequence ?? rowsFound.at(-1)?.sequence ?? null)
      : null,
  };
}

export function canSeeChange(
  sql: SqlDb,
  userId: string,
  change: Pick<ChangeRow, 'entity_kind' | 'entity_id'>,
): boolean {
  const [kind] = change.entity_kind.split('.');
  if (kind === 'issue') {
    const issue = issueRow(sql, change.entity_id);
    return issue !== null && canAccessTeam(sql, userId, issue.team_id);
  }
  if (kind === 'comment') {
    const comment = one<{ issue_id: string } & SqlRow>(
      sql,
      'SELECT issue_id FROM comments WHERE id = ?',
      change.entity_id,
    );
    const issue = comment === null ? null : issueRow(sql, comment.issue_id);
    return issue !== null && canAccessTeam(sql, userId, issue.team_id);
  }
  if (kind === 'team' || kind === 'state')
    return visibleTeamChange(sql, userId, change);
  if (kind === 'project')
    return visibleProjectChange(sql, userId, change.entity_id);
  return true;
}

function visibleTeamChange(
  sql: SqlDb,
  userId: string,
  change: Pick<ChangeRow, 'entity_kind' | 'entity_id'>,
): boolean {
  const teamId = change.entity_kind.startsWith('state.')
    ? one<{ team_id: string } & SqlRow>(
        sql,
        'SELECT team_id FROM workflow_states WHERE id = ?',
        change.entity_id,
      )?.team_id
    : change.entity_id;
  return teamId !== undefined && canAccessTeam(sql, userId, teamId);
}

function visibleProjectChange(
  sql: SqlDb,
  userId: string,
  projectId: string,
): boolean {
  const teams = rows<{ team_id: string } & SqlRow>(
    sql,
    'SELECT team_id FROM project_teams WHERE project_id = ?',
    projectId,
  );
  return (
    teams.length === 0 ||
    teams.some((team) => canAccessTeam(sql, userId, team.team_id))
  );
}

function changeRecord(row: ChangeRow): Change {
  return {
    sequence: row.sequence,
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    version: row.version,
    operationId: row.operation_id,
  };
}

function parseCursor(value: string | null): number {
  if (value === null || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw badRequest('cursor must be a nonnegative integer');
  return parsed;
}

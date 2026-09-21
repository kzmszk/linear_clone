import { newId, rows } from '../db.ts';
import { notFound } from '../errors.ts';
import type { SqlDb, SqlRow } from '../types.ts';

export function setTeamMemberships(
  sql: SqlDb,
  workspaceId: string,
  userId: string,
  teamIds: string[],
  timestamp: string,
): void {
  validateTeamIds(sql, workspaceId, teamIds);
  sql.exec(
    'DELETE FROM team_memberships WHERE workspace_id = ? AND user_id = ?',
    workspaceId,
    userId,
  );
  for (const teamId of teamIds)
    sql.exec(
      'INSERT INTO team_memberships (id, workspace_id, team_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)',
      newId(),
      workspaceId,
      teamId,
      userId,
      timestamp,
    );
}

export function memberTeamIds(
  sql: SqlDb,
  userId: string,
  workspaceId: string,
): string[] {
  return rows<{ team_id: string } & SqlRow>(
    sql,
    'SELECT team_id FROM team_memberships WHERE user_id = ? AND workspace_id = ? ORDER BY team_id',
    userId,
    workspaceId,
  ).map((item) => item.team_id);
}

export function validateTeamIds(
  sql: SqlDb,
  workspaceId: string,
  teamIds: string[],
): void {
  const valid =
    teamIds.length === 0
      ? []
      : rows<{ id: string } & SqlRow>(
          sql,
          'SELECT id FROM teams WHERE workspace_id = ? AND id IN (' +
            teamIds.map(() => '?').join(',') +
            ')',
          workspaceId,
          ...teamIds,
        );
  if (valid.length !== new Set(teamIds).size)
    throw notFound('One or more teams do not belong to this workspace');
}

import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { newId, now, one } from '../db.ts';
import { conflict, notFound } from '../errors.ts';
import { runMutation } from '../mutations.ts';
import { requireManager, requireUser } from './authentication.ts';
import { teamRecord } from './records.ts';
import type { AuthActor, SqlDb, TeamRow, MutationResponse } from '../types.ts';
import type { Team } from '../../../../packages/contracts/src/index.ts';

export type TeamInput = { key: string; name: string; private: boolean };
export type TeamPatch = {
  key?: string;
  name?: string;
  private?: boolean;
  archivedAt?: string | null;
  expectedVersion: number;
};

export function createTeam(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  operationId: string,
  requestHash: string,
  input: TeamInput,
): MutationResponse<Team> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => requireManager(sql, actor, workspaceId),
    apply: () => {
      const user = requireUser(sql, actor);
      const createdAt = now();
      const teamId = newId();
      sql.exec(
        `INSERT INTO teams (id, workspace_id, team_key, name, private, next_issue_number, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)`,
        teamId,
        workspaceId,
        input.key,
        input.name,
        input.private ? 1 : 0,
        createdAt,
        createdAt,
      );
      addDefaultStates(sql, workspaceId, teamId, createdAt);
      sql.exec(
        `INSERT INTO team_memberships (id, workspace_id, team_id, user_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        newId(),
        workspaceId,
        teamId,
        user.id,
        createdAt,
      );
      const row = teamRow(sql, teamId);
      if (row === null) throw new Error('team insert failed');
      return {
        entityKind: 'team.created',
        entityId: teamId,
        version: row.version,
        current: teamRecord(row),
        payload: { key: row.team_key },
      };
    },
    current: (entityId) => {
      const row = teamRow(sql, entityId);
      return row === null ? null : teamRecord(row);
    },
  });
}

export function patchTeam(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  teamId: string,
  operationId: string,
  requestHash: string,
  patch: TeamPatch,
): MutationResponse<Team> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => {
      requireManager(sql, actor, workspaceId);
      verifyTeamWorkspace(sql, teamId, workspaceId);
    },
    apply: () => {
      const row = teamRow(sql, teamId);
      if (row === null) throw notFound();
      if (row.version !== patch.expectedVersion)
        throw conflict('version_conflict', 'Team was changed', teamRecord(row));
      const updatedAt = now();
      sql.exec(
        `UPDATE teams SET team_key = ?, name = ?, private = ?, archived_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`,
        patch.key ?? row.team_key,
        patch.name ?? row.name,
        patch.private === undefined ? row.private : patch.private ? 1 : 0,
        patch.archivedAt === undefined ? row.archived_at : patch.archivedAt,
        updatedAt,
        teamId,
        patch.expectedVersion,
      );
      const updated = teamRow(sql, teamId);
      if (updated === null) throw new Error('team update failed');
      return {
        entityKind: 'team.updated',
        entityId: teamId,
        version: updated.version,
        current: teamRecord(updated),
        payload: { key: updated.team_key },
      };
    },
    current: (entityId) => {
      const row = teamRow(sql, entityId);
      return row === null ? null : teamRecord(row);
    },
  });
}

function addDefaultStates(
  sql: SqlDb,
  workspaceId: string,
  teamId: string,
  timestamp: string,
): void {
  const defaults: Array<[string, string, string, number]> = [
    ['Backlog', 'backlog', '#9095a2', 0],
    ['In Progress', 'started', '#f2c94c', 1],
    ['Done', 'completed', '#27ae60', 2],
  ];
  for (const [name, type, color, position] of defaults) {
    sql.exec(
      `INSERT INTO workflow_states (id, workspace_id, team_id, name, type, color, position, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      newId(),
      workspaceId,
      teamId,
      name,
      type,
      color,
      position,
      timestamp,
      timestamp,
    );
  }
}

function verifyTeamWorkspace(
  sql: SqlDb,
  teamId: string,
  workspaceId: string,
): void {
  const row = one<{ id: string; workspace_id: string }>(
    sql,
    'SELECT id, workspace_id FROM teams WHERE id = ?',
    teamId,
  );
  if (row === null || row.workspace_id !== workspaceId) throw notFound();
}

function teamRow(sql: SqlDb, teamId: string): TeamRow | null {
  return one<TeamRow>(sql, 'SELECT * FROM teams WHERE id = ?', teamId);
}

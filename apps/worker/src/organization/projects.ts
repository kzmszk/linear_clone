import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { newId, now, one, rows } from '../db.ts';
import { conflict, notFound } from '../errors.ts';
import { runMutation } from '../mutations.ts';
import { requireManager } from './authentication.ts';
import { projectRecord } from './records.ts';
import type {
  AuthActor,
  ProjectRow,
  SqlDb,
  MutationResponse,
  SqlRow,
} from '../types.ts';
import type { Project } from '../../../../packages/contracts/src/index.ts';

export type ProjectInput = {
  name: string;
  description: string | null;
  status: string;
  teamIds: string[];
};
export type ProjectPatch = {
  name?: string;
  description?: string | null;
  status?: string;
  teamIds?: string[];
  archivedAt?: string | null;
  expectedVersion: number;
};

export function createProject(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  operationId: string,
  requestHash: string,
  input: ProjectInput,
): MutationResponse<Project> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => requireManager(sql, actor, workspaceId),
    apply: () => {
      verifyTeams(sql, workspaceId, input.teamIds);
      const projectId = newId();
      const timestamp = now();
      sql.exec(
        `INSERT INTO projects (id, workspace_id, name, description, status, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        projectId,
        workspaceId,
        input.name,
        input.description,
        input.status,
        timestamp,
        timestamp,
      );
      setProjectTeams(sql, workspaceId, projectId, input.teamIds);
      const row = projectRow(sql, projectId);
      if (row === null) throw new Error('project insert failed');
      return {
        entityKind: 'project.created',
        entityId: projectId,
        version: row.version,
        current: projectRecord(row, input.teamIds),
        payload: { name: row.name },
      };
    },
    current: (entityId) => projectCurrent(sql, entityId),
  });
}

export function patchProject(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  projectId: string,
  operationId: string,
  requestHash: string,
  patch: ProjectPatch,
): MutationResponse<Project> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => requireManager(sql, actor, workspaceId),
    apply: () => {
      const row = projectRow(sql, projectId);
      if (row === null || row.workspace_id !== workspaceId) throw notFound();
      if (row.version !== patch.expectedVersion)
        throw conflict(
          'version_conflict',
          'Project was changed',
          projectCurrent(sql, projectId),
        );
      const teamIds = patch.teamIds ?? projectTeamIds(sql, projectId);
      verifyTeams(sql, workspaceId, teamIds);
      const timestamp = now();
      sql.exec(
        `UPDATE projects SET name = ?, description = ?, status = ?, archived_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`,
        patch.name ?? row.name,
        patch.description === undefined ? row.description : patch.description,
        patch.status ?? row.status,
        patch.archivedAt === undefined ? row.archived_at : patch.archivedAt,
        timestamp,
        projectId,
        patch.expectedVersion,
      );
      if (patch.teamIds !== undefined)
        setProjectTeams(sql, workspaceId, projectId, teamIds);
      const updated = projectRow(sql, projectId);
      if (updated === null) throw new Error('project update failed');
      return {
        entityKind: 'project.updated',
        entityId: projectId,
        version: updated.version,
        current: projectRecord(updated, teamIds),
        payload: { name: updated.name },
      };
    },
    current: (entityId) => projectCurrent(sql, entityId),
  });
}

function projectCurrent(sql: SqlDb, projectId: string): Project | null {
  const row = projectRow(sql, projectId);
  return row === null
    ? null
    : projectRecord(row, projectTeamIds(sql, projectId));
}

function verifyTeams(sql: SqlDb, workspaceId: string, teamIds: string[]): void {
  if (teamIds.length === 0) return;
  const placeholders = teamIds.map(() => '?').join(', ');
  const found = rows<{ id: string } & SqlRow>(
    sql,
    `SELECT id FROM teams WHERE workspace_id = ? AND id IN (${placeholders})`,
    workspaceId,
    ...teamIds,
  ).length;
  if (found !== new Set(teamIds).size)
    throw notFound('One or more teams do not belong to this workspace');
}

function setProjectTeams(
  sql: SqlDb,
  workspaceId: string,
  projectId: string,
  teamIds: string[],
): void {
  sql.exec('DELETE FROM project_teams WHERE project_id = ?', projectId);
  for (const teamId of teamIds)
    sql.exec(
      'INSERT INTO project_teams (workspace_id, project_id, team_id) VALUES (?, ?, ?)',
      workspaceId,
      projectId,
      teamId,
    );
}

function projectTeamIds(sql: SqlDb, projectId: string): string[] {
  return rows<{ team_id: string } & SqlRow>(
    sql,
    'SELECT team_id FROM project_teams WHERE project_id = ? ORDER BY team_id',
    projectId,
  ).map((row) => row.team_id);
}

function projectRow(sql: SqlDb, projectId: string): ProjectRow | null {
  return one<ProjectRow>(sql, 'SELECT * FROM projects WHERE id = ?', projectId);
}

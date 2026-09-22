import { invitationRecord, type InvitationRow } from './invitations.ts';
import { memberTeamIds } from './team-memberships.ts';
import { one, rows } from '../db.ts';
import { notFound } from '../errors.ts';
import { z } from 'zod';
import {
  canAccessTeam,
  findUser,
  isInstallationAdmin,
  requireMembership,
  requireUser,
} from './authentication.ts';
import {
  labelRecord,
  memberRecord,
  projectRecord,
  stateRecord,
  teamRecord,
  workspaceRecord,
} from './records.ts';
import type {
  LabelRow,
  ProjectRow,
  StateRow,
  TeamRow,
  UserRow,
  WorkspaceRow,
  WorkspaceMembershipRow,
  AuthActor,
  SqlDb,
  SqlRow,
} from '../types.ts';
import type {
  Metadata,
  Principal,
  Workspace,
} from '../../../../packages/contracts/src/index.ts';

type MeResponse = {
  principal: Principal;
  isInstallationAdmin: boolean;
  canBootstrap: boolean;
  workspaces: Workspace[];
};

const workspaceIdReference = z.uuid();

export function getMe(
  sql: SqlDb,
  actor: AuthActor,
  bootstrapOwnerEmail: string,
  bootstrapCompleted: boolean,
): MeResponse {
  const user = findUser(sql, actor);
  const workspaces = user === null ? [] : listWorkspacesForUser(sql, user.id);
  const admin = user !== null && isInstallationAdmin(sql, user.id);
  return {
    principal: { subject: actor.subject, email: actor.email },
    isInstallationAdmin: admin,
    canBootstrap:
      !bootstrapCompleted &&
      actor.email.toLowerCase() === bootstrapOwnerEmail.toLowerCase(),
    workspaces,
  };
}

export function bootstrapCompleted(sql: SqlDb): boolean {
  const row = one<{ bootstrap_completed: number }>(
    sql,
    'SELECT bootstrap_completed FROM installation_settings WHERE id = 1',
  );
  return row?.bootstrap_completed === 1;
}

export function listWorkspaces(sql: SqlDb, actor: AuthActor): Workspace[] {
  const user = requireUser(sql, actor);
  return listWorkspacesForUser(sql, user.id);
}

export function getWorkspace(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
): Workspace {
  requireMembership(sql, actor, workspaceId);
  const row = one<WorkspaceRow>(
    sql,
    'SELECT * FROM workspaces WHERE id = ?',
    workspaceId,
  );
  if (row === null) throw notFound();
  return workspaceRecord(row);
}

export function resolveWorkspaceId(
  sql: SqlDb,
  actor: AuthActor,
  reference: string,
): string {
  const user = findUser(sql, actor);
  if (user === null) throw notFound();
  const byId = one<{ id: string } & SqlRow>(
    sql,
    `SELECT w.id FROM workspaces w
     JOIN workspace_memberships m ON m.workspace_id = w.id
     WHERE w.id = ? AND m.user_id = ? AND m.active = 1`,
    reference,
    user.id,
  );
  if (byId !== null) return byId.id;
  if (workspaceIdReference.safeParse(reference).success) throw notFound();
  const bySlug = one<{ id: string } & SqlRow>(
    sql,
    `SELECT w.id FROM workspaces w
     JOIN workspace_memberships m ON m.workspace_id = w.id
     WHERE lower(w.slug) = lower(?) AND m.user_id = ? AND m.active = 1`,
    reference,
    user.id,
  );
  if (bySlug === null) throw notFound();
  return bySlug.id;
}

export function listTeams(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
): ReturnType<typeof teamRecord>[] {
  const user = requireUser(sql, actor);
  requireMembership(sql, actor, workspaceId);
  return rows<TeamRow>(
    sql,
    'SELECT * FROM teams WHERE workspace_id = ? AND archived_at IS NULL ORDER BY team_key',
    workspaceId,
  )
    .filter((team) => canAccessTeam(sql, user.id, team.id))
    .map(teamRecord);
}

export function listProjects(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  includeArchived = false,
): ReturnType<typeof projectRecord>[] {
  const user = requireUser(sql, actor);
  requireMembership(sql, actor, workspaceId);
  return rows<ProjectRow>(
    sql,
    'SELECT * FROM projects WHERE workspace_id = ? AND (? OR archived_at IS NULL) ORDER BY name, id',
    workspaceId,
    includeArchived ? 1 : 0,
  )
    .map((project) => ({ project, teamIds: projectTeamIds(sql, project.id) }))
    .filter(
      ({ teamIds }) =>
        teamIds.length === 0 ||
        teamIds.some((teamId) => canAccessTeam(sql, user.id, teamId)),
    )
    .map(({ project, teamIds }) => projectRecord(project, teamIds));
}

export function listMembers(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
): ReturnType<typeof memberRecord>[] {
  requireMembership(sql, actor, workspaceId);
  const memberships = rows<WorkspaceMembershipRow>(
    sql,
    'SELECT * FROM workspace_memberships WHERE workspace_id = ? ORDER BY created_at, id',
    workspaceId,
  );
  const activeMembers = memberships.flatMap((membership) => {
    const user = one<UserRow>(
      sql,
      'SELECT * FROM users WHERE id = ?',
      membership.user_id,
    );
    if (user === null) return [];
    return [
      memberRecord(
        membership,
        user,
        memberTeamIds(sql, membership.user_id, workspaceId),
      ),
    ];
  });
  const pending = rows<InvitationRow & SqlRow>(
    sql,
    "SELECT * FROM invitations WHERE workspace_id = ? AND status = 'pending' ORDER BY created_at, id",
    workspaceId,
  ).map(invitationRecord);
  return activeMembers.concat(pending);
}

export function listStates(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
): ReturnType<typeof stateRecord>[] {
  const user = requireUser(sql, actor);
  requireMembership(sql, actor, workspaceId);
  return rows<StateRow>(
    sql,
    'SELECT * FROM workflow_states WHERE workspace_id = ? ORDER BY team_id, position, id',
    workspaceId,
  )
    .filter((state) => canAccessTeam(sql, user.id, state.team_id))
    .map(stateRecord);
}

export function listLabels(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
): ReturnType<typeof labelRecord>[] {
  requireMembership(sql, actor, workspaceId);
  return rows<LabelRow>(
    sql,
    'SELECT * FROM labels WHERE workspace_id = ? AND archived_at IS NULL ORDER BY name, id',
    workspaceId,
  ).map(labelRecord);
}

export function getMetadata(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
): Metadata {
  return {
    teams: listTeams(sql, actor, workspaceId),
    projects: listProjects(sql, actor, workspaceId, true),
    members: listMembers(sql, actor, workspaceId),
    states: listStates(sql, actor, workspaceId),
    labels: listLabels(sql, actor, workspaceId),
  };
}

function listWorkspacesForUser(sql: SqlDb, userId: string): Workspace[] {
  return rows<WorkspaceRow>(
    sql,
    `SELECT w.* FROM workspaces w JOIN workspace_memberships m ON m.workspace_id = w.id WHERE m.user_id = ? AND m.active = 1 ORDER BY w.name, w.id`,
    userId,
  ).map(workspaceRecord);
}

function projectTeamIds(sql: SqlDb, projectId: string): string[] {
  return rows<{ team_id: string }>(
    sql,
    'SELECT team_id FROM project_teams WHERE project_id = ? ORDER BY team_id',
    projectId,
  ).map((row) => row.team_id);
}

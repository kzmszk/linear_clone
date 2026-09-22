import { one, rows } from '../db.ts';
import { badRequest, notFound } from '../errors.ts';
import {
  listMembers,
  listProjects,
  listStates,
  listTeams,
} from '../organization/queries.ts';
import type { AuthActor, SqlDb, SqlRow } from '../types.ts';
import type {
  IssueListFilter,
  NewIssueInput,
  ResolvedIssueListFilter,
} from './inputs.ts';

export function resolveIssueListReferences(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  filter: IssueListFilter,
): ResolvedIssueListFilter {
  const teamId =
    filter.team === null
      ? filter.teamId
      : resolveTeamReference(sql, actor, workspaceId, filter.team);
  return {
    teamId,
    projectId:
      filter.project === null
        ? filter.projectId
        : resolveProjectReference(sql, actor, workspaceId, filter.project),
    stateId:
      filter.state === null
        ? filter.stateId
        : resolveStateReference(sql, actor, workspaceId, teamId, filter.state),
    assigneeId:
      filter.assignee === null
        ? filter.assigneeId
        : resolveAssigneeReference(sql, actor, workspaceId, filter.assignee),
    query: filter.query,
    cursor: filter.cursor,
    deleted: filter.deleted,
    archived: filter.archived,
    lifecycle: filter.lifecycle,
  };
}

function resolveTeamReference(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  reference: string,
): string {
  const needle = reference.toLowerCase();
  const candidates = listTeams(sql, actor, workspaceId);
  const byId = candidates.find((team) => team.id === reference);
  if (byId) return byId.id;
  const matches = candidates.filter(
    (team) =>
      team.key.toLowerCase() === needle || team.name.toLowerCase() === needle,
  );
  return uniqueReference(
    matches,
    `Team not found in workspace: ${reference}`,
    `Team reference is ambiguous: ${reference}`,
  ).id;
}

function resolveStateReference(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  teamId: string | null,
  reference: string,
): string {
  const candidates = listStates(sql, actor, workspaceId).filter(
    (state) => teamId === null || state.teamId === teamId,
  );
  const byId = candidates.find((state) => state.id === reference);
  if (byId) return byId.id;
  const needle = reference.toLowerCase();
  const matches = candidates.filter(
    (state) => state.name.toLowerCase() === needle,
  );
  return uniqueReference(
    matches,
    `Workflow state not found: ${reference}`,
    `Workflow state reference is ambiguous: ${reference}`,
  ).id;
}

function resolveProjectReference(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  reference: string,
): string {
  const candidates = listProjects(sql, actor, workspaceId);
  const byId = candidates.find((project) => project.id === reference);
  if (byId) return byId.id;
  const needle = reference.toLowerCase();
  const matches = candidates.filter(
    (project) => project.name.toLowerCase() === needle,
  );
  return uniqueReference(
    matches,
    `Project not found in workspace: ${reference}`,
    `Project reference is ambiguous: ${reference}`,
  ).id;
}

function resolveAssigneeReference(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  reference: string,
): string {
  const candidates = listMembers(sql, actor, workspaceId);
  const byId = candidates.find(
    (member) => member.id === reference || member.userId === reference,
  );
  if (byId) return assigneeUserId(byId, reference);
  const needle = reference.toLowerCase();
  const matches = candidates.filter(
    (member) =>
      member.email.toLowerCase() === needle ||
      member.name.toLowerCase() === needle,
  );
  const match = uniqueReference(
    matches,
    `Member not found in workspace: ${reference}`,
    `Member reference is ambiguous: ${reference}`,
  );
  return assigneeUserId(match, reference);
}

function assigneeUserId(
  member: ReturnType<typeof listMembers>[number],
  reference: string,
): string {
  if (member.userId === null)
    throw badRequest(`Member has no active user account: ${reference}`);
  return member.userId;
}

function uniqueReference<T>(
  matches: T[],
  missingMessage: string,
  ambiguousMessage: string,
): T {
  if (matches.length > 1) throw badRequest(ambiguousMessage);
  const match = matches[0];
  if (match === undefined) throw notFound(missingMessage);
  return match;
}

export function chooseState(
  sql: SqlDb,
  workspaceId: string,
  teamId: string,
  requested: string | undefined,
): string {
  if (requested !== undefined) {
    const row = one<
      { id: string; workspace_id: string; team_id: string } & SqlRow
    >(
      sql,
      'SELECT id, workspace_id, team_id FROM workflow_states WHERE id = ?',
      requested,
    );
    if (
      row === null ||
      row.workspace_id !== workspaceId ||
      row.team_id !== teamId
    )
      throw notFound('State does not belong to the issue team');
    return requested;
  }
  const first = one<{ id: string } & SqlRow>(
    sql,
    'SELECT id FROM workflow_states WHERE workspace_id = ? AND team_id = ? ORDER BY position, id LIMIT 1',
    workspaceId,
    teamId,
  );
  if (first === null) throw notFound('The team has no workflow state');
  return first.id;
}

export function validateReferences(
  sql: SqlDb,
  workspaceId: string,
  input: NewIssueInput,
  issueId?: string,
): void {
  if (input.projectId !== null) {
    const project = one<{ project_id: string } & SqlRow>(
      sql,
      'SELECT project_id FROM project_teams WHERE project_id = ? AND team_id = ?',
      input.projectId,
      input.teamId,
    );
    if (project === null)
      throw notFound('Project is not associated with this team');
  }
  if (input.parentId !== null) {
    const parent = one<{ id: string; workspace_id: string } & SqlRow>(
      sql,
      'SELECT id, workspace_id FROM issues WHERE id = ?',
      input.parentId,
    );
    if (
      parent === null ||
      parent.workspace_id !== workspaceId ||
      parent.id === issueId
    )
      throw notFound('Parent issue was not found');
  }
  if (input.assigneeId !== null) {
    const assignee = one<{ id: string } & SqlRow>(
      sql,
      'SELECT u.id FROM users u JOIN workspace_memberships m ON m.user_id = u.id WHERE u.id = ? AND m.workspace_id = ? AND m.active = 1',
      input.assigneeId,
      workspaceId,
    );
    if (assignee === null) throw notFound('Assignee is not a workspace member');
  }
  if (input.labelIds.length > 0) {
    const labels = rows<{ id: string } & SqlRow>(
      sql,
      `SELECT id FROM labels WHERE workspace_id = ? AND id IN (${input.labelIds.map(() => '?').join(',')})`,
      workspaceId,
      ...input.labelIds,
    );
    if (labels.length !== new Set(input.labelIds).size)
      throw notFound('One or more labels were not found');
  }
}

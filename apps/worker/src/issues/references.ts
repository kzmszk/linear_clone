import { one, rows } from '../db.ts';
import { notFound } from '../errors.ts';
import type { SqlDb, SqlRow } from '../types.ts';
import type { NewIssueInput } from './inputs.ts';

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

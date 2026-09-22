import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { newId, now, one } from '../db.ts';
import { conflict, notFound } from '../errors.ts';
import { runMutation } from '../mutations.ts';
import { requireTeamAccess } from '../organization/authentication.ts';
import { getIssue, issueLabelIds, issueRow } from './queries.ts';
import { issueRecord } from './records.ts';
import type {
  AuthActor,
  IssueRow,
  MutationResponse,
  SqlDb,
  SqlRow,
} from '../types.ts';
import type { Issue } from '../../../../packages/contracts/src/index.ts';

import type { NewIssueInput, IssueEdit } from './inputs.ts';
import { chooseState, validateReferences } from './references.ts';
import { updateStateDates, setLabels, addActivity } from './writes.ts';

export function createIssue(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  operationId: string,
  requestHash: string,
  input: NewIssueInput,
): MutationResponse<Issue> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => requireTeamAccess(sql, actor, input.teamId),
    apply: () => {
      const team = one<
        { id: string; workspace_id: string; next_issue_number: number } & SqlRow
      >(
        sql,
        'SELECT id, workspace_id, next_issue_number FROM teams WHERE id = ?',
        input.teamId,
      );
      if (team === null || team.workspace_id !== workspaceId) throw notFound();
      const stateId = chooseState(
        sql,
        workspaceId,
        input.teamId,
        input.stateId,
      );
      validateReferences(sql, workspaceId, input);
      const issueId = newId();
      const timestamp = now();
      sql.exec(
        'UPDATE teams SET next_issue_number = next_issue_number + 1 WHERE id = ?',
        input.teamId,
      );
      sql.exec(
        `INSERT INTO issues (id, workspace_id, team_id, issue_number, title, description, state_id, priority, assignee_id, project_id, parent_id, estimate, due_date, version, created_at, updated_at, archived_at, deleted_at, completed_at, canceled_at, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, NULL, NULL, NULL, NULL)`,
        issueId,
        workspaceId,
        input.teamId,
        team.next_issue_number,
        input.title,
        input.description,
        stateId,
        input.priority,
        input.assigneeId,
        input.projectId,
        input.parentId,
        input.estimate,
        input.dueDate,
        timestamp,
        timestamp,
      );
      updateStateDates(sql, issueId, stateId, timestamp);
      setLabels(sql, issueId, input.labelIds);
      addActivity(sql, workspaceId, issueId, actor.email, 'created', timestamp);
      const row = issueRow(sql, issueId);
      if (row === null) throw new Error('issue insert failed');
      return {
        entityKind: 'issue.created',
        entityId: issueId,
        version: row.version,
        current: issueRecord(row, input.labelIds),
        payload: { title: row.title },
      };
    },
    current: (entityId) => getIssue(sql, actor, workspaceId, entityId),
  });
}

export function patchIssue(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
  operationId: string,
  requestHash: string,
  patch: IssueEdit,
): MutationResponse<Issue> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => authorizeIssue(sql, actor, workspaceId, issueId),
    apply: () => applyIssuePatch(sql, actor, workspaceId, issueId, patch),
    current: (entityId) => getIssue(sql, actor, workspaceId, entityId),
  });
}

function applyIssuePatch(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
  patch: IssueEdit,
) {
  const row = issueRow(sql, issueId);
  if (row === null || row.workspace_id !== workspaceId) throw notFound();
  if (row.version !== patch.expectedVersion)
    throw conflict(
      'version_conflict',
      'Issue was changed',
      issueRecord(row, issueLabelIds(sql, issueId)),
    );
  const input = editToIssue(row, patch, issueLabelIds(sql, issueId));
  const stateId = chooseState(sql, workspaceId, row.team_id, input.stateId);
  validateReferences(sql, workspaceId, input, issueId);
  const timestamp = now();
  sql.exec(
    'UPDATE issues SET title = ?, description = ?, state_id = ?, priority = ?, assignee_id = ?, project_id = ?, parent_id = ?, estimate = ?, due_date = ?, archived_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
    input.title,
    input.description,
    stateId,
    input.priority,
    input.assigneeId,
    input.projectId,
    input.parentId,
    input.estimate,
    input.dueDate,
    patch.archivedAt === undefined ? row.archived_at : patch.archivedAt,
    timestamp,
    issueId,
    patch.expectedVersion,
  );
  if (stateId !== row.state_id)
    updateStateDates(sql, issueId, stateId, timestamp);
  if (patch.assigneeId !== undefined)
    sql.exec(
      'UPDATE issues SET source_assignee_id = NULL, source_assignee_name = NULL WHERE id = ?',
      issueId,
    );
  if (patch.labelIds !== undefined) setLabels(sql, issueId, patch.labelIds);
  addActivity(sql, workspaceId, issueId, actor.email, 'updated', timestamp);
  const updated = issueRow(sql, issueId);
  if (updated === null) throw new Error('issue update failed');
  return {
    entityKind: 'issue.updated',
    entityId: issueId,
    version: updated.version,
    current: issueRecord(updated, issueLabelIds(sql, issueId)),
    payload: { title: updated.title },
  };
}

function editToIssue(
  row: IssueRow,
  patch: IssueEdit,
  labels: string[],
): NewIssueInput {
  return {
    teamId: row.team_id,
    title: patch.title ?? row.title,
    description:
      patch.description === undefined ? row.description : patch.description,
    stateId: patch.stateId ?? row.state_id,
    priority: patch.priority ?? row.priority,
    assigneeId:
      patch.assigneeId === undefined ? row.assignee_id : patch.assigneeId,
    projectId: patch.projectId === undefined ? row.project_id : patch.projectId,
    parentId: patch.parentId === undefined ? row.parent_id : patch.parentId,
    estimate: patch.estimate === undefined ? row.estimate : patch.estimate,
    dueDate: patch.dueDate === undefined ? row.due_date : patch.dueDate,
    labelIds: patch.labelIds ?? labels,
  };
}

export function deleteIssue(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
  operationId: string,
  requestHash: string,
  expectedVersion: number,
): MutationResponse<Issue> {
  return lifecycleIssue(
    sql,
    storage,
    actor,
    workspaceId,
    issueId,
    operationId,
    requestHash,
    expectedVersion,
    'deleted',
  );
}

export function restoreIssue(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
  operationId: string,
  requestHash: string,
  expectedVersion: number,
): MutationResponse<Issue> {
  return lifecycleIssue(
    sql,
    storage,
    actor,
    workspaceId,
    issueId,
    operationId,
    requestHash,
    expectedVersion,
    'restored',
  );
}

function lifecycleIssue(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
  operationId: string,
  requestHash: string,
  expectedVersion: number,
  action: 'deleted' | 'restored',
): MutationResponse<Issue> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => authorizeIssue(sql, actor, workspaceId, issueId),
    apply: () => {
      const row = issueRow(sql, issueId);
      if (row === null || row.workspace_id !== workspaceId) throw notFound();
      if (row.version !== expectedVersion)
        throw conflict(
          'version_conflict',
          'Issue was changed',
          issueRecord(row, issueLabelIds(sql, issueId)),
        );
      const timestamp = now();
      sql.exec(
        'UPDATE issues SET deleted_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
        action === 'deleted' ? timestamp : null,
        timestamp,
        issueId,
        expectedVersion,
      );
      addActivity(sql, workspaceId, issueId, actor.email, action, timestamp);
      const updated = issueRow(sql, issueId);
      if (updated === null) throw new Error('issue lifecycle update failed');
      return {
        entityKind: action === 'deleted' ? 'issue.deleted' : 'issue.restored',
        entityId: issueId,
        version: updated.version,
        current: issueRecord(updated, issueLabelIds(sql, issueId)),
        payload: { deleted: action === 'deleted' },
      };
    },
    current: (entityId) => getIssue(sql, actor, workspaceId, entityId),
  });
}

function authorizeIssue(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
): void {
  const row = issueRow(sql, issueId);
  if (row === null || row.workspace_id !== workspaceId) throw notFound();
  requireTeamAccess(sql, actor, row.team_id);
}

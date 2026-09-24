import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { z } from 'zod';
import {
  newStateSchema,
  statePatchSchema,
} from '../../../../packages/contracts/src/index.ts';
import { newId, now, one } from '../db.ts';
import { conflict, notFound } from '../errors.ts';
import { runMutation } from '../mutations.ts';
import { requireManager } from './authentication.ts';
import { stateRecord } from './records.ts';
import type {
  AuthActor,
  AppliedMutation,
  MutationResponse,
  SqlDb,
  StateRow,
} from '../types.ts';
import type { WorkflowState } from '../../../../packages/contracts/src/index.ts';

export type StateInput = z.infer<typeof newStateSchema>;
export type StatePatch = z.infer<typeof statePatchSchema>;
export function createState(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  operationId: string,
  requestHash: string,
  input: StateInput,
): MutationResponse<WorkflowState> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => requireManager(sql, actor, workspaceId),
    apply: () => {
      const team = one<
        { id: string; workspace_id: string } & Record<string, SqlStorageValue>
      >(sql, 'SELECT id, workspace_id FROM teams WHERE id = ?', input.teamId);
      if (team === null || team.workspace_id !== workspaceId)
        throw notFound('Team does not belong to this workspace');
      const existing = one<StateRow>(
        sql,
        'SELECT * FROM workflow_states WHERE team_id = ? AND name = ?',
        input.teamId,
        input.name,
      );
      if (existing !== null) {
        if (existing.archived_at === null)
          throw conflict(
            'state_exists',
            'A status with this name already exists',
          );
        return stateUpdatedMutation(restoreArchivedState(sql, existing, input));
      }
      const timestamp = now();
      const stateId = newId();
      sql.exec(
        'INSERT INTO workflow_states (id, workspace_id, team_id, name, type, color, position, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
        stateId,
        workspaceId,
        input.teamId,
        input.name,
        input.type,
        input.color,
        input.position,
        timestamp,
        timestamp,
      );
      const row = stateRow(sql, stateId);
      if (row === null) throw new Error('state insert failed');
      return {
        entityKind: 'state.created',
        entityId: stateId,
        version: row.version,
        current: stateRecord(row),
        payload: { name: row.name },
      };
    },
    current: (entityId) => stateCurrent(sql, entityId),
  });
}

function restoreArchivedState(
  sql: SqlDb,
  row: StateRow,
  input: StateInput,
): StateRow {
  sql.exec(
    'UPDATE workflow_states SET type = ?, color = ?, position = ?, archived_at = NULL, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
    input.type,
    input.color,
    input.position,
    now(),
    row.id,
    row.version,
  );
  const restored = stateRow(sql, row.id);
  if (restored === null) throw new Error('state restore failed');
  return restored;
}

export function patchState(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  stateId: string,
  operationId: string,
  requestHash: string,
  patch: StatePatch,
): MutationResponse<WorkflowState> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => requireManager(sql, actor, workspaceId),
    apply: () =>
      stateUpdatedMutation(applyStatePatch(sql, workspaceId, stateId, patch)),
    current: (entityId) => stateCurrent(sql, entityId),
  });
}

export function deleteState(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  stateId: string,
  operationId: string,
  requestHash: string,
  expectedVersion: number,
): MutationResponse<WorkflowState> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => requireManager(sql, actor, workspaceId),
    apply: () =>
      stateUpdatedMutation(
        archiveState(sql, workspaceId, stateId, expectedVersion),
      ),
    current: (entityId) => stateCurrent(sql, entityId),
  });
}

function stateCurrent(sql: SqlDb, id: string): WorkflowState | null {
  const row = stateRow(sql, id);
  return row === null ? null : stateRecord(row);
}

function applyStatePatch(
  sql: SqlDb,
  workspaceId: string,
  stateId: string,
  patch: StatePatch,
): StateRow {
  const row = stateForPatch(sql, workspaceId, stateId, patch);
  if (
    patch.type !== undefined &&
    patch.type !== row.type &&
    stateHasIssues(sql, workspaceId, stateId)
  )
    throw conflict(
      'state_in_use',
      'Move issues to another state before changing its type',
    );
  const timestamp = now();
  sql.exec(
    'UPDATE workflow_states SET name = ?, type = ?, color = ?, position = ?, archived_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
    patch.name ?? row.name,
    patch.type ?? row.type,
    patch.color ?? row.color,
    patch.position ?? row.position,
    patch.archivedAt === null ? null : row.archived_at,
    timestamp,
    stateId,
    patch.expectedVersion,
  );
  const updated = stateRow(sql, stateId);
  if (updated === null) throw new Error('state update failed');
  return updated;
}

function stateForPatch(
  sql: SqlDb,
  workspaceId: string,
  stateId: string,
  patch: StatePatch,
): StateRow {
  const row = stateRow(sql, stateId);
  if (row === null || row.workspace_id !== workspaceId) throw notFound();
  if (row.version !== patch.expectedVersion)
    throw conflict('version_conflict', 'State was changed', stateRecord(row));
  if (row.archived_at !== null && patch.archivedAt !== null)
    throw conflict('state_archived', 'State is archived', stateRecord(row));
  return row;
}

function archiveState(
  sql: SqlDb,
  workspaceId: string,
  stateId: string,
  expectedVersion: number,
): StateRow {
  const row = editableState(sql, workspaceId, stateId, expectedVersion);
  if (stateHasIssues(sql, workspaceId, stateId))
    throw conflict(
      'state_in_use',
      'Move issues to another state before archiving it',
    );
  if (activeStateCount(sql, row.team_id) <= 1)
    throw conflict(
      'last_state',
      'A team must keep at least one active workflow state',
    );
  const timestamp = now();
  sql.exec(
    'UPDATE workflow_states SET archived_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
    timestamp,
    timestamp,
    stateId,
    expectedVersion,
  );
  const archived = stateRow(sql, stateId);
  if (archived === null) throw new Error('state archive failed');
  return archived;
}

function editableState(
  sql: SqlDb,
  workspaceId: string,
  stateId: string,
  expectedVersion: number,
): StateRow {
  const row = stateRow(sql, stateId);
  if (row === null || row.workspace_id !== workspaceId) throw notFound();
  if (row.version !== expectedVersion)
    throw conflict('version_conflict', 'State was changed', stateRecord(row));
  if (row.archived_at !== null)
    throw conflict('state_archived', 'State is archived', stateRecord(row));
  return row;
}

function stateHasIssues(
  sql: SqlDb,
  workspaceId: string,
  stateId: string,
): boolean {
  return (
    one<{ id: string }>(
      sql,
      'SELECT id FROM issues WHERE workspace_id = ? AND state_id = ? LIMIT 1',
      workspaceId,
      stateId,
    ) !== null
  );
}

function activeStateCount(sql: SqlDb, teamId: string): number {
  const row = one<{ count: number }>(
    sql,
    'SELECT COUNT(*) AS count FROM workflow_states WHERE team_id = ? AND archived_at IS NULL',
    teamId,
  );
  return row?.count ?? 0;
}

function stateUpdatedMutation(row: StateRow): AppliedMutation<WorkflowState> {
  return {
    entityKind: 'state.updated',
    entityId: row.id,
    version: row.version,
    current: stateRecord(row),
    payload: { name: row.name },
  };
}

function stateRow(sql: SqlDb, id: string): StateRow | null {
  return one<StateRow>(sql, 'SELECT * FROM workflow_states WHERE id = ?', id);
}

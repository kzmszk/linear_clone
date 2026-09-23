import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { z } from 'zod';
import {
  labelSchema,
  newStateSchema,
  statePatchSchema,
} from '../../../../packages/contracts/src/index.ts';
import { newId, now, one } from '../db.ts';
import { conflict, notFound } from '../errors.ts';
import { runMutation } from '../mutations.ts';
import { requireManager } from './authentication.ts';
import { labelRecord, stateRecord } from './records.ts';
import type {
  AuthActor,
  LabelRow,
  MutationResponse,
  SqlDb,
  StateRow,
} from '../types.ts';
import type { WorkflowState } from '../../../../packages/contracts/src/index.ts';

type Label = z.infer<typeof labelSchema>;
export type StateInput = z.infer<typeof newStateSchema>;
export type StatePatch = z.infer<typeof statePatchSchema>;
export type LabelInput = { name: string; color: string };
export type LabelPatch = {
  name?: string;
  color?: string;
  archivedAt?: string | null;
  expectedVersion: number;
};

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
    apply: () => {
      const row = stateRow(sql, stateId);
      if (row === null || row.workspace_id !== workspaceId) throw notFound();
      if (row.version !== patch.expectedVersion)
        throw conflict(
          'version_conflict',
          'State was changed',
          stateRecord(row),
        );
      if (
        patch.type !== undefined &&
        patch.type !== row.type &&
        one<{ id: string }>(
          sql,
          'SELECT id FROM issues WHERE workspace_id = ? AND state_id = ? LIMIT 1',
          workspaceId,
          stateId,
        ) !== null
      )
        throw conflict(
          'state_in_use',
          'Move issues to another state before changing its type',
        );
      const timestamp = now();
      sql.exec(
        'UPDATE workflow_states SET name = ?, type = ?, color = ?, position = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
        patch.name ?? row.name,
        patch.type ?? row.type,
        patch.color ?? row.color,
        patch.position ?? row.position,
        timestamp,
        stateId,
        patch.expectedVersion,
      );
      const updated = stateRow(sql, stateId);
      if (updated === null) throw new Error('state update failed');
      return {
        entityKind: 'state.updated',
        entityId: stateId,
        version: updated.version,
        current: stateRecord(updated),
        payload: { name: updated.name },
      };
    },
    current: (entityId) => stateCurrent(sql, entityId),
  });
}

export function createLabel(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  operationId: string,
  requestHash: string,
  input: LabelInput,
): MutationResponse<Label> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => requireManager(sql, actor, workspaceId),
    apply: () => {
      const timestamp = now();
      const labelId = newId();
      sql.exec(
        'INSERT INTO labels (id, workspace_id, name, color, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
        labelId,
        workspaceId,
        input.name,
        input.color,
        timestamp,
        timestamp,
      );
      const row = labelRow(sql, labelId);
      if (row === null) throw new Error('label insert failed');
      return {
        entityKind: 'label.created',
        entityId: labelId,
        version: row.version,
        current: labelRecord(row),
        payload: { name: row.name },
      };
    },
    current: (entityId) => labelCurrent(sql, entityId),
  });
}

export function patchLabel(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  labelId: string,
  operationId: string,
  requestHash: string,
  patch: LabelPatch,
): MutationResponse<Label> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => requireManager(sql, actor, workspaceId),
    apply: () => {
      const row = labelRow(sql, labelId);
      if (row === null || row.workspace_id !== workspaceId) throw notFound();
      if (row.version !== patch.expectedVersion)
        throw conflict(
          'version_conflict',
          'Label was changed',
          labelRecord(row),
        );
      const timestamp = now();
      sql.exec(
        'UPDATE labels SET name = ?, color = ?, archived_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
        patch.name ?? row.name,
        patch.color ?? row.color,
        patch.archivedAt === undefined ? row.archived_at : patch.archivedAt,
        timestamp,
        labelId,
        patch.expectedVersion,
      );
      const updated = labelRow(sql, labelId);
      if (updated === null) throw new Error('label update failed');
      return {
        entityKind: 'label.updated',
        entityId: labelId,
        version: updated.version,
        current: labelRecord(updated),
        payload: { name: updated.name },
      };
    },
    current: (entityId) => labelCurrent(sql, entityId),
  });
}

function stateCurrent(sql: SqlDb, id: string): WorkflowState | null {
  const row = stateRow(sql, id);
  return row === null ? null : stateRecord(row);
}
function labelCurrent(sql: SqlDb, id: string): Label | null {
  const row = labelRow(sql, id);
  return row === null ? null : labelRecord(row);
}
function stateRow(sql: SqlDb, id: string): StateRow | null {
  return one<StateRow>(sql, 'SELECT * FROM workflow_states WHERE id = ?', id);
}
function labelRow(sql: SqlDb, id: string): LabelRow | null {
  return one<LabelRow>(sql, 'SELECT * FROM labels WHERE id = ?', id);
}

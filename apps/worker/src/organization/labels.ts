import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { z } from 'zod';
import { labelSchema } from '../../../../packages/contracts/src/index.ts';
import { newId, now, one } from '../db.ts';
import { conflict, notFound } from '../errors.ts';
import { runMutation } from '../mutations.ts';
import { requireManager } from './authentication.ts';
import { labelRecord } from './records.ts';
import type { AuthActor, LabelRow, MutationResponse, SqlDb } from '../types.ts';

type Label = z.infer<typeof labelSchema>;
export type LabelInput = { name: string; color: string };
export type LabelPatch = {
  name?: string;
  color?: string;
  archivedAt?: string | null;
  expectedVersion: number;
};

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
      const existing = one<LabelRow>(
        sql,
        'SELECT * FROM labels WHERE workspace_id = ? AND name = ?',
        workspaceId,
        input.name,
      );
      if (existing !== null) {
        if (existing.archived_at === null)
          throw conflict(
            'label_exists',
            'A label with this name already exists',
          );
        sql.exec(
          'UPDATE labels SET color = ?, archived_at = NULL, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
          input.color,
          now(),
          existing.id,
          existing.version,
        );
        const restored = labelRow(sql, existing.id);
        if (restored === null) throw new Error('label restore failed');
        return {
          entityKind: 'label.updated',
          entityId: restored.id,
          version: restored.version,
          current: labelRecord(restored),
          payload: { name: restored.name },
        };
      }
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

function labelCurrent(sql: SqlDb, id: string): Label | null {
  const row = labelRow(sql, id);
  return row === null ? null : labelRecord(row);
}
function labelRow(sql: SqlDb, id: string): LabelRow | null {
  return one<LabelRow>(sql, 'SELECT * FROM labels WHERE id = ?', id);
}

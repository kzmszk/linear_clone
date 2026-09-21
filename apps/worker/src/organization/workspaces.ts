import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { newId, now, one } from '../db.ts';
import { conflict, forbidden, notFound } from '../errors.ts';
import { actorKey, runMutation } from '../mutations.ts';
import {
  isInstallationAdmin,
  requireManager,
  requireUser,
} from './authentication.ts';
import { bootstrapCompleted } from './queries.ts';
import { workspaceRecord } from './records.ts';
import type {
  AppliedMutation,
  AuthActor,
  SqlDb,
  UserRow,
  WorkspaceRow,
  MutationResponse,
} from '../types.ts';
import type { Workspace } from '../../../../packages/contracts/src/index.ts';

export type WorkspaceInput = { slug: string; name: string };
export type WorkspacePatch = {
  name?: string;
  slug?: string;
  archivedAt?: string | null;
  expectedVersion: number;
};

export function bootstrapWorkspace(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  ownerEmail: string,
  operationId: string,
  requestHash: string,
  input: WorkspaceInput,
): MutationResponse<Workspace> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId: null,
    authorize: () => {
      if (actor.email.toLowerCase() !== ownerEmail.toLowerCase())
        throw forbidden('Bootstrap owner email does not match');
      if (bootstrapCompleted(sql) && !operationExists(sql, actor, operationId))
        throw conflict(
          'already_bootstrapped',
          'The installation is already bootstrapped',
        );
    },
    apply: () => {
      const createdAt = now();
      const userId = ensureUser(sql, actor, createdAt);
      const workspaceId = newId();
      sql.exec(
        `INSERT INTO workspaces (id, slug, name, version, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
        workspaceId,
        input.slug,
        input.name,
        createdAt,
        createdAt,
      );
      sql.exec(
        `INSERT INTO workspace_memberships (id, workspace_id, user_id, role, active, version, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', 1, 1, ?, ?)`,
        newId(),
        workspaceId,
        userId,
        createdAt,
        createdAt,
      );
      sql.exec(
        'INSERT OR IGNORE INTO installation_admins (user_id) VALUES (?)',
        userId,
      );
      sql.exec(
        'UPDATE installation_settings SET bootstrap_completed = 1 WHERE id = 1',
      );
      const row = workspaceRow(sql, workspaceId);
      if (row === null) throw new Error('workspace insert failed');
      return {
        entityKind: 'workspace.created',
        entityId: workspaceId,
        version: row.version,
        current: workspaceRecord(row),
        payload: { slug: row.slug },
      };
    },
    current: (entityId) => {
      const row = workspaceRow(sql, entityId);
      return row === null ? null : workspaceRecord(row);
    },
  });
}

export function createWorkspace(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  operationId: string,
  requestHash: string,
  input: WorkspaceInput,
): MutationResponse<Workspace> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId: null,
    authorize: () => {
      const user = requireUser(sql, actor);
      if (!isInstallationAdmin(sql, user.id))
        throw forbidden('Installation admin role required');
    },
    apply: () => insertWorkspace(sql, actor, input),
    current: (entityId) => {
      const row = workspaceRow(sql, entityId);
      return row === null ? null : workspaceRecord(row);
    },
  });
}

export function patchWorkspace(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  operationId: string,
  requestHash: string,
  patch: WorkspacePatch,
): MutationResponse<Workspace> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => requireManager(sql, actor, workspaceId),
    apply: () => {
      const row = workspaceRow(sql, workspaceId);
      if (row === null) throw notFound();
      if (row.version !== patch.expectedVersion)
        throw conflict(
          'version_conflict',
          'Workspace was changed',
          workspaceRecord(row),
        );
      const updatedAt = now();
      sql.exec(
        `UPDATE workspaces SET name = ?, slug = ?, archived_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`,
        patch.name ?? row.name,
        patch.slug ?? row.slug,
        patch.archivedAt === undefined ? row.archived_at : patch.archivedAt,
        updatedAt,
        workspaceId,
        patch.expectedVersion,
      );
      const updated = workspaceRow(sql, workspaceId);
      if (updated === null) throw new Error('workspace update failed');
      return {
        entityKind: 'workspace.updated',
        entityId: workspaceId,
        version: updated.version,
        current: workspaceRecord(updated),
        payload: { name: updated.name },
      };
    },
    current: (entityId) => {
      const row = workspaceRow(sql, entityId);
      return row === null ? null : workspaceRecord(row);
    },
  });
}

function insertWorkspace(
  sql: SqlDb,
  actor: AuthActor,
  input: WorkspaceInput,
): AppliedMutation<Workspace> {
  const user = requireUser(sql, actor);
  const createdAt = now();
  const workspaceId = newId();
  sql.exec(
    'INSERT INTO workspaces (id, slug, name, version, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)',
    workspaceId,
    input.slug,
    input.name,
    createdAt,
    createdAt,
  );
  sql.exec(
    `INSERT INTO workspace_memberships (id, workspace_id, user_id, role, active, version, created_at, updated_at) VALUES (?, ?, ?, 'owner', 1, 1, ?, ?)`,
    newId(),
    workspaceId,
    user.id,
    createdAt,
    createdAt,
  );
  const row = workspaceRow(sql, workspaceId);
  if (row === null) throw new Error('workspace insert failed');
  return {
    entityKind: 'workspace.created',
    entityId: workspaceId,
    version: row.version,
    current: workspaceRecord(row),
    payload: { slug: row.slug },
  };
}

function ensureUser(sql: SqlDb, actor: AuthActor, createdAt: string): string {
  const existing = one<UserRow>(
    sql,
    'SELECT * FROM users WHERE access_issuer = ? AND access_subject = ?',
    actor.issuer,
    actor.subject,
  );
  if (existing !== null) return existing.id;
  const userId = newId();
  sql.exec(
    'INSERT INTO users (id, access_issuer, access_subject, verified_email, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    userId,
    actor.issuer,
    actor.subject,
    actor.email,
    '',
    createdAt,
  );
  return userId;
}

function workspaceRow(sql: SqlDb, workspaceId: string): WorkspaceRow | null {
  return one<WorkspaceRow>(
    sql,
    'SELECT * FROM workspaces WHERE id = ?',
    workspaceId,
  );
}

function operationExists(
  sql: SqlDb,
  actor: AuthActor,
  operationId: string,
): boolean {
  return (
    one<{ operation_id: string } & Record<string, SqlStorageValue>>(
      sql,
      'SELECT operation_id FROM operations WHERE actor_key = ? AND operation_id = ?',
      actorKey(actor),
      operationId,
    ) !== null
  );
}

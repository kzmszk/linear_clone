import { setTeamMemberships, memberTeamIds } from './team-memberships.ts';
import {
  createInvitation,
  invitationCurrent,
  patchInvitation,
} from './invitations.ts';
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { newId, now, one } from '../db.ts';
import { conflict, forbidden, notFound } from '../errors.ts';
import { runMutation } from '../mutations.ts';
import { findMembership, requireManager } from './authentication.ts';
import { memberRecord } from './records.ts';
import type {
  AppliedMutation,
  AuthActor,
  MutationResponse,
  SqlDb,
  SqlRow,
  UserRow,
  WorkspaceMembershipRow,
} from '../types.ts';
import type { Member } from '../../../../packages/contracts/src/index.ts';

export type MemberInput = {
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  teamIds: string[];
};
export type MemberPatch = {
  role?: 'owner' | 'admin' | 'member';
  active?: boolean;
  teamIds?: string[];
  expectedVersion: number;
};

export function createMember(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  operationId: string,
  requestHash: string,
  input: MemberInput,
): MutationResponse<Member> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => requireManager(sql, actor, workspaceId),
    apply: () => applyMemberCreate(sql, workspaceId, input),
    current: (entityId) => memberCurrent(sql, entityId),
  });
}

function applyMemberCreate(
  sql: SqlDb,
  workspaceId: string,
  input: MemberInput,
): AppliedMutation<Member> {
  const existingUser = one<UserRow>(
    sql,
    'SELECT * FROM users WHERE lower(verified_email) = lower(?)',
    input.email,
  );
  if (
    existingUser !== null &&
    findMembership(sql, existingUser.id, workspaceId) !== null
  )
    throw conflict(
      'already_member',
      'That person is already a workspace member',
    );
  const timestamp = now();
  if (existingUser === null)
    return createInvitation(sql, workspaceId, input, timestamp);
  const membershipId = newId();
  sql.exec(
    'INSERT INTO workspace_memberships (id, workspace_id, user_id, role, active, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?)',
    membershipId,
    workspaceId,
    existingUser.id,
    input.role,
    timestamp,
    timestamp,
  );
  setTeamMemberships(
    sql,
    workspaceId,
    existingUser.id,
    input.teamIds,
    timestamp,
  );
  const row = membershipRow(sql, membershipId);
  if (row === null) throw new Error('member insert failed');
  return {
    entityKind: 'member.created',
    entityId: membershipId,
    version: row.version,
    current: memberRecord(row, existingUser, input.teamIds),
    payload: { email: existingUser.verified_email },
  };
}

export function patchMember(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  membershipId: string,
  operationId: string,
  requestHash: string,
  patch: MemberPatch,
): MutationResponse<Member> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => requireManager(sql, actor, workspaceId),
    apply: () => applyMemberPatch(sql, workspaceId, membershipId, patch),
    current: (entityId) => memberCurrent(sql, entityId),
  });
}

function applyMemberPatch(
  sql: SqlDb,
  workspaceId: string,
  membershipId: string,
  patch: MemberPatch,
): AppliedMutation<Member> {
  const row = membershipRow(sql, membershipId);
  if (row === null)
    return patchInvitation(sql, workspaceId, membershipId, patch);
  if (row.workspace_id !== workspaceId) throw notFound();
  if (row.version !== patch.expectedVersion)
    throw conflict(
      'version_conflict',
      'Member was changed',
      memberCurrent(sql, membershipId),
    );
  if (isOwnerDemotion(row, patch)) protectLastOwner(sql, workspaceId, row);
  const timestamp = now();
  sql.exec(
    'UPDATE workspace_memberships SET role = ?, active = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
    nextRole(row, patch),
    nextActive(row, patch),
    timestamp,
    membershipId,
    patch.expectedVersion,
  );
  if (patch.teamIds !== undefined)
    setTeamMemberships(sql, workspaceId, row.user_id, patch.teamIds, timestamp);
  const updated = membershipRow(sql, membershipId);
  if (updated === null) throw new Error('member update failed');
  const user = one<UserRow>(
    sql,
    'SELECT * FROM users WHERE id = ?',
    updated.user_id,
  );
  if (user === null) throw new Error('member user missing');
  return {
    entityKind: 'member.updated',
    entityId: membershipId,
    version: updated.version,
    current: memberRecord(
      updated,
      user,
      memberTeamIds(sql, updated.user_id, workspaceId),
    ),
    payload: { role: updated.role, active: updated.active === 1 },
  };
}

function isOwnerDemotion(
  row: WorkspaceMembershipRow,
  patch: MemberPatch,
): boolean {
  return (
    row.active === 1 &&
    (patch.active === false ||
      (patch.role !== undefined && patch.role !== row.role))
  );
}

function nextRole(
  row: WorkspaceMembershipRow,
  patch: MemberPatch,
): WorkspaceMembershipRow['role'] {
  return patch.role ?? row.role;
}

function nextActive(row: WorkspaceMembershipRow, patch: MemberPatch): number {
  if (patch.active === undefined) return row.active;
  return patch.active ? 1 : 0;
}

export function removeMember(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  membershipId: string,
  operationId: string,
  requestHash: string,
  expectedVersion: number,
): MutationResponse<Member> {
  return patchMember(
    sql,
    storage,
    actor,
    workspaceId,
    membershipId,
    operationId,
    requestHash,
    { active: false, expectedVersion },
  );
}

function memberCurrent(sql: SqlDb, membershipId: string): Member | null {
  const row = membershipRow(sql, membershipId);
  if (row === null) return invitationCurrent(sql, membershipId);
  const user = one<UserRow>(
    sql,
    'SELECT * FROM users WHERE id = ?',
    row.user_id,
  );
  return user === null
    ? null
    : memberRecord(
        row,
        user,
        memberTeamIds(sql, row.user_id, row.workspace_id),
      );
}

function protectLastOwner(
  sql: SqlDb,
  workspaceId: string,
  row: WorkspaceMembershipRow,
): void {
  if (row.role !== 'owner') return;
  const count = one<{ count: number } & SqlRow>(
    sql,
    "SELECT COUNT(*) AS count FROM workspace_memberships WHERE workspace_id = ? AND role = 'owner' AND active = 1",
    workspaceId,
  );
  if ((count?.count ?? 0) <= 1)
    throw forbidden('The last workspace owner cannot be removed');
}

function membershipRow(
  sql: SqlDb,
  membershipId: string,
): WorkspaceMembershipRow | null {
  return one<WorkspaceMembershipRow>(
    sql,
    'SELECT * FROM workspace_memberships WHERE id = ?',
    membershipId,
  );
}

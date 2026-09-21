import { newId, now, one } from '../db.ts';
import type { AppliedMutation, SqlDb, SqlRow } from '../types.ts';
import type { Member } from '../../../../packages/contracts/src/index.ts';
import { conflict, notFound } from '../errors.ts';
import { validateTeamIds } from './team-memberships.ts';
import type { MemberInput, MemberPatch } from './members.ts';

export function createInvitation(
  sql: SqlDb,
  workspaceId: string,
  input: MemberInput,
  timestamp: string,
): AppliedMutation<Member> {
  validateTeamIds(sql, workspaceId, input.teamIds);
  const invitationId = newId();
  sql.exec(
    "INSERT INTO invitations (id, workspace_id, email, name, role, team_ids_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)",
    invitationId,
    workspaceId,
    input.email.toLowerCase(),
    input.name,
    input.role,
    JSON.stringify(input.teamIds),
    timestamp,
  );
  return {
    entityKind: 'invitation.created',
    entityId: invitationId,
    version: 1,
    current: {
      id: invitationId,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      workspaceId,
      userId: null,
      email: input.email.toLowerCase(),
      name: input.name,
      role: input.role,
      active: false,
      teamIds: input.teamIds,
    },
    payload: { email: input.email.toLowerCase() },
  };
}

export function invitationCurrent(
  sql: SqlDb,
  invitationId: string,
): Member | null {
  const row = one<InvitationRow & SqlRow>(
    sql,
    'SELECT * FROM invitations WHERE id = ?',
    invitationId,
  );
  if (row === null) return null;
  return invitationRecord(row);
}

export function invitationRecord(row: InvitationRow): Member {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    workspaceId: row.workspace_id,
    userId: null,
    email: row.email,
    name: row.name,
    role: row.role,
    active: row.status === 'accepted',
    teamIds: parseTeamIds(row.team_ids_json),
  };
}

function parseTeamIds(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}
export type InvitationRow = {
  id: string;
  workspace_id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  team_ids_json: string;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: string;
  updated_at: string | null;
  version: number;
};

export function patchInvitation(
  sql: SqlDb,
  workspaceId: string,
  invitationId: string,
  patch: MemberPatch,
): AppliedMutation<Member> {
  const row = one<InvitationRow & SqlRow>(
    sql,
    'SELECT * FROM invitations WHERE id = ? AND workspace_id = ?',
    invitationId,
    workspaceId,
  );
  if (row === null || row.status === 'accepted') throw notFound();
  const current = invitationCurrent(sql, invitationId);
  if (row.version !== patch.expectedVersion)
    throw conflict('version_conflict', 'Invitation was changed', current);
  if (patch.teamIds !== undefined)
    validateTeamIds(sql, workspaceId, patch.teamIds);
  sql.exec(
    'UPDATE invitations SET role = ?, team_ids_json = ?, status = ?, version = version + 1, updated_at = ? WHERE id = ?',
    patch.role ?? row.role,
    patch.teamIds === undefined
      ? row.team_ids_json
      : JSON.stringify(patch.teamIds),
    patch.active === false ? 'revoked' : row.status,
    now(),
    invitationId,
  );
  const updated = invitationCurrent(sql, invitationId);
  if (updated === null) throw new Error('Invitation disappeared');
  return {
    entityKind: 'invitation.updated',
    entityId: invitationId,
    version: updated.version,
    current: updated,
    payload: { active: false },
  };
}

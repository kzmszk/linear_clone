import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { forbidden, notFound } from '../errors.ts';
import { one, newId, now, rows } from '../db.ts';
import type {
  AuthActor,
  SqlDb,
  UserRow,
  WorkspaceMembershipRow,
} from '../types.ts';

type InvitationRow = {
  id: string;
  workspace_id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  team_ids_json: string;
  status: 'pending' | 'accepted' | 'revoked';
};

export function activateInvitedActor(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
): void {
  storage.transactionSync(() => {
    let user = findUser(sql, actor);
    const invitations = rows<InvitationRow>(
      sql,
      `SELECT id, workspace_id, email, name, role, team_ids_json, status
       FROM invitations WHERE lower(email) = lower(?) AND status = 'pending'`,
      actor.email,
    );
    if (user === null && invitations.length === 0) return;
    if (user === null) {
      const userId = newId();
      const createdAt = now();
      sql.exec(
        `INSERT INTO users (id, access_issuer, access_subject, verified_email, name, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        userId,
        actor.issuer,
        actor.subject,
        actor.email,
        invitations[0]?.name ?? '',
        createdAt,
      );
      user = {
        id: userId,
        access_issuer: actor.issuer,
        access_subject: actor.subject,
        verified_email: actor.email,
        name: invitations[0]?.name ?? '',
        created_at: createdAt,
      };
    }
    for (const invitation of invitations)
      acceptInvitation(sql, invitation, user);
  });
}

export function findUser(sql: SqlDb, actor: AuthActor): UserRow | null {
  return one<UserRow>(
    sql,
    `SELECT id, access_issuer, access_subject, verified_email, name, created_at
     FROM users WHERE access_issuer = ? AND access_subject = ?`,
    actor.issuer,
    actor.subject,
  );
}

export function requireUser(sql: SqlDb, actor: AuthActor): UserRow {
  const user = findUser(sql, actor);
  if (user === null)
    throw forbidden('The authenticated principal is not an invited member');
  return user;
}

export function findMembership(
  sql: SqlDb,
  userId: string,
  workspaceId: string,
): WorkspaceMembershipRow | null {
  return one<WorkspaceMembershipRow>(
    sql,
    `SELECT id, workspace_id, user_id, role, active, version, created_at, updated_at
     FROM workspace_memberships WHERE user_id = ? AND workspace_id = ?`,
    userId,
    workspaceId,
  );
}

export function requireMembership(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
): WorkspaceMembershipRow {
  const user = findUser(sql, actor);
  if (user === null) throw notFound();
  const membership = findMembership(sql, user.id, workspaceId);
  if (membership === null || membership.active !== 1) throw notFound();
  return membership;
}

export function requireManager(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
): WorkspaceMembershipRow {
  const membership = requireMembership(sql, actor, workspaceId);
  if (membership.role === 'member')
    throw forbidden('Workspace admin or owner role required');
  return membership;
}

export function isInstallationAdmin(sql: SqlDb, userId: string): boolean {
  return (
    one<{ user_id: string }>(
      sql,
      'SELECT user_id FROM installation_admins WHERE user_id = ?',
      userId,
    ) !== null
  );
}

export function canAccessTeam(
  sql: SqlDb,
  userId: string,
  teamId: string,
): boolean {
  const team = one<{ private: number; workspace_id: string }>(
    sql,
    'SELECT private, workspace_id FROM teams WHERE id = ?',
    teamId,
  );
  if (team === null) return false;
  const workspaceMembership = one<{ id: string }>(
    sql,
    'SELECT id FROM workspace_memberships WHERE workspace_id = ? AND user_id = ? AND active = 1',
    team.workspace_id,
    userId,
  );
  if (workspaceMembership === null) return false;
  if (team.private === 0) return true;
  return (
    one<{ id: string }>(
      sql,
      'SELECT id FROM team_memberships WHERE team_id = ? AND user_id = ?',
      teamId,
      userId,
    ) !== null
  );
}

export function requireTeamAccess(
  sql: SqlDb,
  actor: AuthActor,
  teamId: string,
): UserRow {
  const user = requireUser(sql, actor);
  if (!canAccessTeam(sql, user.id, teamId)) throw notFound();
  return user;
}

function acceptInvitation(
  sql: SqlDb,
  invitation: InvitationRow,
  user: UserRow,
): void {
  const membership = findMembership(sql, user.id, invitation.workspace_id);
  if (membership === null) {
    const timestamp = now();
    sql.exec(
      `INSERT INTO workspace_memberships (id, workspace_id, user_id, role, active, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
      newId(),
      invitation.workspace_id,
      user.id,
      invitation.role,
      timestamp,
      timestamp,
    );
  }
  for (const teamId of parseTeamIds(invitation.team_ids_json)) {
    const team = one<{ id: string; workspace_id: string }>(
      sql,
      'SELECT id, workspace_id FROM teams WHERE id = ?',
      teamId,
    );
    if (team?.workspace_id !== invitation.workspace_id) continue;
    sql.exec(
      `INSERT OR IGNORE INTO team_memberships (id, workspace_id, team_id, user_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      newId(),
      invitation.workspace_id,
      teamId,
      user.id,
      now(),
    );
  }
  sql.exec(
    `UPDATE invitations SET status = 'accepted', accepted_by = ? WHERE id = ?`,
    user.id,
    invitation.id,
  );
}

function parseTeamIds(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is string => typeof item === 'string');
}

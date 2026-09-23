import {
  findMembership,
  findUser,
  requireMembership,
} from '../organization/authentication.ts';
import { one, rows } from '../db.ts';
import { canSeeChange } from './queries.ts';
import type { AuthActor, SqlDb, SqlRow } from '../types.ts';

const maxSocketAgeMs = 60 * 60 * 1000;
type BroadcastChange = {
  workspace_id: string | null;
  sequence: number;
  entity_kind: string;
  entity_id: string;
  version: number;
} & SqlRow;

export function openWorkspaceEvents(
  request: Request,
  sql: SqlDb,
  state: DurableObjectState,
  actor: AuthActor,
  workspaceId: string,
): Response {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
    return Response.json(
      {
        error: {
          code: 'upgrade_required',
          message: 'WebSocket upgrade required',
        },
      },
      { status: 426 },
    );
  const membership = requireMembership(sql, actor, workspaceId);
  const pair = new WebSocketPair();
  pair[1].serializeAttachment({
    workspaceId,
    actor,
    connectedAt: Date.now(),
  });
  state.acceptWebSocket(pair[1], [`workspace:${workspaceId}`]);
  const visibleTeamIds = rows<{ id: string } & SqlRow>(
    sql,
    `SELECT t.id FROM teams t
     WHERE t.workspace_id = ? AND (
       t.private = 0 OR EXISTS (
         SELECT 1 FROM team_memberships tm
         WHERE tm.team_id = t.id AND tm.user_id = ?
       )
     ) ORDER BY t.id`,
    workspaceId,
    membership.user_id,
  ).map((team) => team.id);
  pair[1].send(JSON.stringify({ kind: 'ready', workspaceId, visibleTeamIds }));
  return new Response(null, { status: 101, webSocket: pair[0] });
}

export function broadcastChanges(
  sql: SqlDb,
  state: DurableObjectState,
  previousSequence: number,
): void {
  const changes = sql
    .exec<BroadcastChange>(
      'SELECT workspace_id, sequence, entity_kind, entity_id, version FROM changes WHERE sequence > ? ORDER BY sequence',
      previousSequence,
    )
    .toArray();
  for (const change of changes) {
    if (change.workspace_id === null) continue;
    const revokedUserId =
      change.entity_kind === 'member.team_access_revoked'
        ? one<{ user_id: string }>(
            sql,
            'SELECT user_id FROM workspace_memberships WHERE id = ?',
            change.entity_id,
          )?.user_id
        : undefined;
    const message = JSON.stringify({
      sequence: change.sequence,
      entityKind: change.entity_kind,
      entityId: change.entity_id,
      version: change.version,
    });
    for (const socket of state.getWebSockets(
      `workspace:${change.workspace_id}`,
    ))
      deliverChange(sql, socket, change, message, revokedUserId);
  }
}

function deliverChange(
  sql: SqlDb,
  socket: WebSocket,
  change: BroadcastChange,
  message: string,
  revokedUserId: string | undefined,
): void {
  const attachment: unknown = socket.deserializeAttachment();
  if (
    !isSocketAttachment(attachment) ||
    attachment.workspaceId !== change.workspace_id
  ) {
    socket.close(1002, 'Invalid socket');
    return;
  }
  if (Date.now() - attachment.connectedAt > maxSocketAgeMs) {
    socket.close(1001, 'Connection expired');
    return;
  }
  const user = findUser(sql, attachment.actor);
  if (
    user === null ||
    findMembership(sql, user.id, attachment.workspaceId)?.active !== 1
  ) {
    socket.close(1008, 'Membership required');
    return;
  }
  if (user.id === revokedUserId) {
    socket.close(1008, 'Access changed');
    return;
  }
  const visible = canSeeChange(sql, user.id, change);
  if (change.entity_kind === 'team.privatized' && !visible) {
    socket.close(1008, 'Access changed');
    return;
  }
  if (visible) socket.send(message);
}

type SocketAttachment = {
  workspaceId: string;
  actor: AuthActor;
  connectedAt: number;
};

function isSocketAttachment(value: unknown): value is SocketAttachment {
  if (!isRecord(value)) return false;
  const actor = value.actor;
  if (!isRecord(actor)) return false;
  return (
    typeof value.workspaceId === 'string' &&
    typeof value.connectedAt === 'number' &&
    typeof actor.issuer === 'string' &&
    typeof actor.subject === 'string' &&
    typeof actor.email === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

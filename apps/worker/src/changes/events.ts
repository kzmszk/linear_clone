import {
  findMembership,
  findUser,
  requireMembership,
} from '../organization/authentication.ts';
import { canSeeChange } from './queries.ts';
import type { AuthActor, SqlDb, SqlRow } from '../types.ts';

const maxSocketAgeMs = 60 * 60 * 1000;

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
  requireMembership(sql, actor, workspaceId);
  const pair = new WebSocketPair();
  pair[1].serializeAttachment({
    workspaceId,
    actor,
    connectedAt: Date.now(),
  });
  state.acceptWebSocket(pair[1], [`workspace:${workspaceId}`]);
  pair[1].send(JSON.stringify({ kind: 'ready', workspaceId }));
  return new Response(null, { status: 101, webSocket: pair[0] });
}

export function broadcastChanges(
  sql: SqlDb,
  state: DurableObjectState,
  previousSequence: number,
): void {
  const changes = sql
    .exec<
      {
        workspace_id: string | null;
        sequence: number;
        entity_kind: string;
        entity_id: string;
        version: number;
      } & SqlRow
    >(
      'SELECT workspace_id, sequence, entity_kind, entity_id, version FROM changes WHERE sequence > ? ORDER BY sequence',
      previousSequence,
    )
    .toArray();
  for (const change of changes) {
    if (change.workspace_id === null) continue;
    const message = JSON.stringify({
      sequence: change.sequence,
      entityKind: change.entity_kind,
      entityId: change.entity_id,
      version: change.version,
    });
    for (const socket of state.getWebSockets(
      `workspace:${change.workspace_id}`,
    )) {
      const attachment: unknown = socket.deserializeAttachment();
      if (
        !isSocketAttachment(attachment) ||
        attachment.workspaceId !== change.workspace_id ||
        !socketIsActive(sql, attachment)
      ) {
        socket.close(1008, 'Membership required');
        continue;
      }
      const user = findUser(sql, attachment.actor);
      if (user === null || !canSeeChange(sql, user.id, change)) continue;
      socket.send(message);
    }
  }
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

function socketIsActive(sql: SqlDb, attachment: SocketAttachment): boolean {
  if (Date.now() - attachment.connectedAt > maxSocketAgeMs) return false;
  const user = findUser(sql, attachment.actor);
  return (
    user !== null &&
    findMembership(sql, user.id, attachment.workspaceId)?.active === 1
  );
}

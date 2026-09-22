import type { DurableObjectStorage } from '@cloudflare/workers-types';
import {
  syncRequestSchema,
  type SyncOperation,
} from '../../../../packages/contracts/src/sync.ts';
import { hashPayload } from '../mutations.ts';
import { applySyncOperations } from '../sync/apply.ts';
import { buildSyncSnapshot, readSyncIdentity } from '../sync/snapshot.ts';
import type { AuthActor, SqlDb } from '../types.ts';
import { parseBody, response } from './parse.ts';

export async function routeSync(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
): Promise<Response | null> {
  if (request.method !== 'POST') return null;
  const body = await parseBody(request, syncRequestSchema);
  const prepared = await prepareSyncOperations(workspaceId, body.operations);
  const result = applySyncOperations(
    { sql, storage, actor, workspaceId },
    prepared,
  );
  const identity = readSyncIdentity(sql, actor, workspaceId);
  const snapshot =
    body.afterSequence !== undefined && body.afterSequence === identity.sequence
      ? null
      : buildSyncSnapshot(sql, actor, workspaceId);
  return response({ ...identity, ...result, snapshot });
}

async function prepareSyncOperations(
  workspaceId: string,
  operations: SyncOperation[],
) {
  return Promise.all(
    operations.map(async (operation) => ({
      operation,
      requestHash: await hashPayload({
        namespace: 'sync',
        workspaceId,
        operation,
      }),
    })),
  );
}

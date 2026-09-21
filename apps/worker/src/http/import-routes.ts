import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { hashPayload, requireOperationId } from '../mutations.ts';
import { parseBody, response } from './parse.ts';
import {
  applyImportBatch,
  importBatchSchema,
  importVerifySchema,
  withPayloadHashes,
} from '../imports/service.ts';
import {
  getImportRun,
  listImportRuns,
  verifyImport,
} from '../imports/status.ts';
import type { AuthActor, SqlDb } from '../types.ts';

export async function routeImports(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  rest: string[],
): Promise<Response | null> {
  if (rest.length === 0 && request.method === 'GET')
    return response(listImportRuns(sql, actor, workspaceId));
  if (rest.length === 1 && request.method === 'GET')
    return response(getImportRun(sql, actor, workspaceId, rest[0]));
  if (rest.length === 1 && rest[0] === 'verify' && request.method === 'POST') {
    const input = await parseBody(request, importVerifySchema);
    return response(verifyImport(sql, actor, workspaceId, input));
  }
  if (rest.length !== 0 || request.method !== 'POST') return null;
  const batch = await parseBody(request, importBatchSchema);
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  const hashes = await Promise.all(
    batch.items.map((item) => hashPayload(item.payload)),
  );
  const result = applyImportBatch(
    sql,
    storage,
    actor,
    workspaceId,
    operationId,
    await hashPayload({ path: request.url, body: batch }),
    batch,
    withPayloadHashes(batch, hashes),
  );
  return response(result, 201);
}

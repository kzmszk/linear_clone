import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { z } from 'zod';
import { hashPayload, requireOperationId } from '../mutations.ts';
import { parseBody, response } from './parse.ts';
import type { AuthActor, SqlDb } from '../types.ts';
import {
  newStateSchema,
  newLabelSchema,
  versionInputSchema,
} from '../../../../packages/contracts/src/index.ts';
import { listStates, listLabels } from '../organization/queries.ts';
import {
  createState,
  patchState,
  createLabel,
  patchLabel,
} from '../organization/states-labels.ts';
const statePatchSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  color: z.string().optional(),
  position: z.number().optional(),
  expectedVersion: z.number().int().positive(),
});
const labelPatchSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  archivedAt: z.string().nullable().optional(),
  expectedVersion: z.number().int().positive(),
});

export async function states(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  rest: string[],
): Promise<Response> {
  if (rest.length === 0 && request.method === 'GET')
    return response(listStates(sql, actor, workspaceId));
  if (rest.length === 0 && request.method === 'POST') {
    const body = await parseBody(request, newStateSchema);
    const operationId = requireOperationId(
      request.headers.get('Idempotency-Key'),
    );
    return response(
      createState(
        sql,
        storage,
        actor,
        workspaceId,
        operationId,
        await hashPayload({ path: request.url, body }),
        body,
      ),
      201,
    );
  }
  if (rest.length !== 1 || request.method !== 'PATCH')
    return new Response(null, { status: 404 });
  const body = await parseBody(request, statePatchSchema);
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  return response(
    patchState(
      sql,
      storage,
      actor,
      workspaceId,
      rest[0],
      operationId,
      await hashPayload({ path: request.url, body }),
      body,
    ),
  );
}

export async function labels(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  rest: string[],
): Promise<Response> {
  if (rest.length === 0 && request.method === 'GET')
    return response(listLabels(sql, actor, workspaceId));
  if (rest.length === 0 && request.method === 'POST') {
    const body = await parseBody(request, newLabelSchema);
    const operationId = requireOperationId(
      request.headers.get('Idempotency-Key'),
    );
    return response(
      createLabel(
        sql,
        storage,
        actor,
        workspaceId,
        operationId,
        await hashPayload({ path: request.url, body }),
        body,
      ),
      201,
    );
  }
  if (
    rest.length !== 1 ||
    (request.method !== 'PATCH' && request.method !== 'DELETE')
  )
    return new Response(null, { status: 404 });
  const body =
    request.method === 'DELETE'
      ? {
          expectedVersion: (await parseBody(request, versionInputSchema))
            .expectedVersion,
          archivedAt: new Date().toISOString(),
        }
      : await parseBody(request, labelPatchSchema);
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  return response(
    patchLabel(
      sql,
      storage,
      actor,
      workspaceId,
      rest[0],
      operationId,
      await hashPayload({ path: request.url, body }),
      body,
    ),
  );
}

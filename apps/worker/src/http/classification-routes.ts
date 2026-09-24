import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { z } from 'zod';
import { hashPayload, requireOperationId } from '../mutations.ts';
import { parseBody, response } from './parse.ts';
import type { AuthActor, SqlDb } from '../types.ts';
import {
  newStateSchema,
  newLabelSchema,
  statePatchSchema,
  versionInputSchema,
} from '../../../../packages/contracts/src/index.ts';
import { listStates, listLabels } from '../organization/queries.ts';
import {
  createState,
  deleteState,
  patchState,
} from '../organization/states.ts';
import { createLabel, patchLabel } from '../organization/labels.ts';
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
    return response(
      listStates(
        sql,
        actor,
        workspaceId,
        new URL(request.url).searchParams.get('includeArchived') === 'true',
      ),
    );
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
  if (
    rest.length !== 1 ||
    (request.method !== 'PATCH' && request.method !== 'DELETE')
  )
    return new Response(null, { status: 404 });
  const isDelete = request.method === 'DELETE';
  const input = isDelete
    ? await parseBody(request, versionInputSchema)
    : await parseBody(request, statePatchSchema);
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  const requestHash = await hashPayload({
    path: request.url,
    body: input,
    ...(isDelete ? { method: 'DELETE' } : {}),
  });
  if (isDelete)
    return response(
      deleteState(
        sql,
        storage,
        actor,
        workspaceId,
        rest[0],
        operationId,
        requestHash,
        input.expectedVersion,
      ),
    );
  return response(
    patchState(
      sql,
      storage,
      actor,
      workspaceId,
      rest[0],
      operationId,
      requestHash,
      input,
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
    return response(
      listLabels(
        sql,
        actor,
        workspaceId,
        new URL(request.url).searchParams.get('includeArchived') === 'true',
      ),
    );
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
      ? await parseBody(request, versionInputSchema)
      : await parseBody(request, labelPatchSchema);
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  const requestHash = await hashPayload({
    path: request.url,
    body,
    ...(request.method === 'DELETE' ? { method: 'DELETE' } : {}),
  });
  return response(
    patchLabel(
      sql,
      storage,
      actor,
      workspaceId,
      rest[0],
      operationId,
      requestHash,
      request.method === 'DELETE'
        ? { ...body, archivedAt: new Date().toISOString() }
        : body,
    ),
  );
}

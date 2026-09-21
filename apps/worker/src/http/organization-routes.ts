import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { z } from 'zod';
import { hashPayload, requireOperationId } from '../mutations.ts';
import { parseBody, response } from './parse.ts';
import type { AuthActor, SqlDb } from '../types.ts';
import {
  newWorkspaceSchema,
  versionInputSchema,
} from '../../../../packages/contracts/src/index.ts';
import {
  getMe,
  getMetadata,
  getWorkspace,
  listWorkspaces,
} from '../organization/queries.ts';
import {
  bootstrapWorkspace,
  createWorkspace,
  patchWorkspace,
} from '../organization/workspaces.ts';
import { teams, projects, members } from './resource-routes.ts';
import { states, labels } from './classification-routes.ts';
const workspacePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(),
  archivedAt: z.string().nullable().optional(),
  expectedVersion: z.number().int().positive(),
});
export async function routeOrganization(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  segments: string[],
  bootstrapOwnerEmail: string,
): Promise<Response | null> {
  if (
    segments.length === 1 &&
    segments[0] === 'me' &&
    request.method === 'GET'
  ) {
    const settings = sql
      .exec<{ bootstrap_completed: number }>(
        'SELECT bootstrap_completed FROM installation_settings WHERE id = 1',
      )
      .toArray()[0];
    return response(
      getMe(
        sql,
        actor,
        bootstrapOwnerEmail,
        settings?.bootstrap_completed === 1,
      ),
    );
  }
  if (
    segments.length === 1 &&
    segments[0] === 'bootstrap' &&
    request.method === 'POST'
  )
    return bootstrap(request, sql, storage, actor, bootstrapOwnerEmail);
  return routeWorkspace(request, sql, storage, actor, segments);
}

async function routeWorkspace(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  segments: string[],
): Promise<Response | null> {
  if (segments[0] !== 'workspaces') return null;
  if (segments.length === 1 && request.method === 'GET')
    return response(listWorkspaces(sql, actor));
  if (segments.length === 1 && request.method === 'POST')
    return workspaceCreate(request, sql, storage, actor);
  if (segments.length < 2) return null;
  const workspaceId = segments[1];
  if (segments.length === 2)
    return workspaceItem(request, sql, storage, actor, workspaceId);
  return routeWorkspaceResource(
    request,
    sql,
    storage,
    actor,
    workspaceId,
    segments[2],
    segments.slice(3),
  );
}

async function routeWorkspaceResource(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  resource: string,
  rest: string[],
): Promise<Response | null> {
  if (resource === 'metadata' && request.method === 'GET' && rest.length === 0)
    return response(getMetadata(sql, actor, workspaceId));
  if (resource === 'teams')
    return teams(request, sql, storage, actor, workspaceId, rest);
  if (resource === 'projects')
    return projects(request, sql, storage, actor, workspaceId, rest);
  if (resource === 'members')
    return members(request, sql, storage, actor, workspaceId, rest);
  if (resource === 'states')
    return states(request, sql, storage, actor, workspaceId, rest);
  if (resource === 'labels')
    return labels(request, sql, storage, actor, workspaceId, rest);
  return null;
}

async function bootstrap(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  ownerEmail: string,
): Promise<Response> {
  const body = await parseBody(request, newWorkspaceSchema);
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  const hash = await hashPayload({ path: '/bootstrap', body });
  return response(
    bootstrapWorkspace(
      sql,
      storage,
      actor,
      ownerEmail,
      operationId,
      hash,
      body,
    ),
    201,
  );
}

async function workspaceCreate(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
): Promise<Response> {
  const body = await parseBody(request, newWorkspaceSchema);
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  const hash = await hashPayload({ path: '/workspaces', body });
  return response(
    createWorkspace(sql, storage, actor, operationId, hash, body),
    201,
  );
}

async function workspaceItem(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
): Promise<Response> {
  if (request.method === 'GET')
    return response(getWorkspace(sql, actor, workspaceId));
  if (request.method !== 'PATCH' && request.method !== 'DELETE')
    return new Response(null, { status: 404 });
  const body =
    request.method === 'DELETE'
      ? {
          expectedVersion: (await parseBody(request, versionInputSchema))
            .expectedVersion,
          archivedAt: new Date().toISOString(),
        }
      : await parseBody(request, workspacePatchSchema);
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  const hash = await hashPayload({ path: request.url, body });
  return response(
    patchWorkspace(sql, storage, actor, workspaceId, operationId, hash, body),
  );
}

import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { z } from 'zod';
import { hashPayload, requireOperationId } from '../mutations.ts';
import { parseBody, response } from './parse.ts';
import type { AuthActor, SqlDb } from '../types.ts';
import {
  newTeamSchema,
  newProjectSchema,
  newMemberSchema,
  versionInputSchema,
} from '../../../../packages/contracts/src/index.ts';
import {
  listTeams,
  listProjects,
  listMembers,
} from '../organization/queries.ts';
import { createTeam, patchTeam } from '../organization/teams.ts';
import { createProject, patchProject } from '../organization/projects.ts';
import {
  createMember,
  patchMember,
  removeMember,
} from '../organization/members.ts';
const teamPatchSchema = z.object({
  key: z
    .string()
    .regex(/^[A-Z][A-Z0-9]{0,9}$/)
    .optional(),
  name: z.string().trim().min(1).max(120).optional(),
  private: z.boolean().optional(),
  archivedAt: z.string().nullable().optional(),
  expectedVersion: z.number().int().positive(),
});
const projectPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  status: z.string().optional(),
  teamIds: z.array(z.string().uuid()).optional(),
  archivedAt: z.string().nullable().optional(),
  expectedVersion: z.number().int().positive(),
});
const memberPatchSchema = z.object({
  role: z.enum(['owner', 'admin', 'member']).optional(),
  active: z.boolean().optional(),
  teamIds: z.array(z.string().uuid()).optional(),
  expectedVersion: z.number().int().positive(),
});
export async function teams(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  rest: string[],
): Promise<Response> {
  if (rest.length === 0 && request.method === 'GET')
    return response(listTeams(sql, actor, workspaceId));
  if (rest.length === 0 && request.method === 'POST') {
    const body = await parseBody(request, newTeamSchema);
    const operationId = requireOperationId(
      request.headers.get('Idempotency-Key'),
    );
    return response(
      createTeam(
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
      : await parseBody(request, teamPatchSchema);
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  return response(
    patchTeam(
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

export async function projects(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  rest: string[],
): Promise<Response> {
  if (rest.length === 0 && request.method === 'GET')
    return response(
      listProjects(
        sql,
        actor,
        workspaceId,
        new URL(request.url).searchParams.get('includeArchived') === 'true',
      ),
    );
  if (rest.length === 0 && request.method === 'POST') {
    const body = await parseBody(request, newProjectSchema);
    const operationId = requireOperationId(
      request.headers.get('Idempotency-Key'),
    );
    return response(
      createProject(
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
      : await parseBody(request, projectPatchSchema);
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  return response(
    patchProject(
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

export async function members(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  rest: string[],
): Promise<Response> {
  if (rest.length === 0 && request.method === 'GET')
    return response(listMembers(sql, actor, workspaceId));
  if (rest.length === 0 && request.method === 'POST') {
    const body = await parseBody(request, newMemberSchema);
    const operationId = requireOperationId(
      request.headers.get('Idempotency-Key'),
    );
    return response(
      createMember(
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
  if (rest.length !== 1) return new Response(null, { status: 404 });
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  if (request.method === 'PATCH') {
    const body = await parseBody(request, memberPatchSchema);
    return response(
      patchMember(
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
  if (request.method === 'DELETE') {
    const body = await parseBody(request, versionInputSchema);
    return response(
      removeMember(
        sql,
        storage,
        actor,
        workspaceId,
        rest[0],
        operationId,
        await hashPayload({ path: request.url, body }),
        body.expectedVersion,
      ),
    );
  }
  return new Response(null, { status: 404 });
}

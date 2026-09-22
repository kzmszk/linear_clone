import { listRelations } from '../issues/relations.ts';
import { listAttachments } from '../issues/attachments.ts';
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import {
  newCommentSchema,
  newIssueSchema,
  issuePatchSchema,
  versionInputSchema,
} from '../../../../packages/contracts/src/index.ts';
import { hashPayload, requireOperationId } from '../mutations.ts';
import { parseBody, response } from './parse.ts';
import {
  listActivity,
  listComments,
  getComment,
  listIssues,
  getIssue,
} from '../issues/queries.ts';
import {
  createIssue,
  deleteIssue,
  patchIssue,
  restoreIssue,
} from '../issues/mutations.ts';
import {
  createComment,
  deleteComment,
  patchComment,
} from '../issues/comments.ts';
import { z } from 'zod';
import { badRequest } from '../errors.ts';
import { parseBoolean } from '../db.ts';
import type { IssueLifecycle, IssueListFilter } from '../issues/inputs.ts';
import type { AuthActor, SqlDb } from '../types.ts';

const commentPatchSchema = z.object({
  body: z.string().min(1).max(100000).optional(),
  expectedVersion: z.number().int().positive(),
});

export async function routeIssues(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  rest: string[],
): Promise<Response | null> {
  if (rest.length === 0)
    return issueCollection(request, sql, storage, actor, workspaceId);
  return issueResource(
    request,
    sql,
    storage,
    actor,
    workspaceId,
    rest[0],
    rest.slice(1),
  );
}

async function issueCollection(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
): Promise<Response | null> {
  if (request.method === 'GET')
    return response(
      listIssues(
        sql,
        actor,
        workspaceId,
        issueListFilter(new URL(request.url)),
      ),
    );
  if (request.method !== 'POST') return null;
  const body = await parseBody(request, newIssueSchema);
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  return response(
    createIssue(
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

function issueListFilter(url: URL): IssueListFilter {
  const lifecycle = lifecycleFilter(url.searchParams.get('lifecycle'));
  rejectDuplicateReference(url, 'team');
  rejectDuplicateReference(url, 'project');
  rejectDuplicateReference(url, 'state');
  rejectDuplicateReference(url, 'assignee');
  return {
    teamId: url.searchParams.get('teamId'),
    team: url.searchParams.get('team'),
    projectId: url.searchParams.get('projectId'),
    project: url.searchParams.get('project'),
    stateId: url.searchParams.get('stateId'),
    state: url.searchParams.get('state'),
    assigneeId: url.searchParams.get('assigneeId'),
    assignee: url.searchParams.get('assignee'),
    query: url.searchParams.get('q'),
    cursor: url.searchParams.get('cursor'),
    deleted: parseBoolean(url.searchParams.get('deleted'), false),
    archived: parseBoolean(url.searchParams.get('archived'), false),
    lifecycle,
  };
}

function lifecycleFilter(value: string | null): IssueLifecycle | null {
  if (value === null) return null;
  if (value === 'open' || value === 'closed' || value === 'all') return value;
  throw badRequest('lifecycle must be open, closed, or all');
}

function rejectDuplicateReference(url: URL, name: string): void {
  if (url.searchParams.has(`${name}Id`) && url.searchParams.has(name))
    throw badRequest(`Use only one of ${name}Id and ${name}`);
}

async function issueResource(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
  rest: string[],
): Promise<Response | null> {
  if (rest.length === 0)
    return issueItem(request, sql, storage, actor, workspaceId, issueId);
  if (rest[0] === 'restore' && rest.length === 1)
    return issueRestore(request, sql, storage, actor, workspaceId, issueId);
  if (rest[0] === 'comments')
    return comments(
      request,
      sql,
      storage,
      actor,
      workspaceId,
      issueId,
      rest.slice(1),
    );
  if (rest.length === 1 && request.method === 'GET') {
    switch (rest[0]) {
      case 'attachments':
        return response(
          listAttachments(
            sql,
            actor,
            workspaceId,
            issueId,
            new URL(request.url).searchParams.get('includeArchived') === 'true',
          ),
        );
      case 'relations':
        return response(listRelations(sql, actor, workspaceId, issueId));
      case 'activity':
        return response(listActivity(sql, actor, workspaceId, issueId));
    }
  }
  return null;
}

async function issueItem(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
): Promise<Response | null> {
  if (request.method === 'GET')
    return response(getIssue(sql, actor, workspaceId, issueId));
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  if (request.method === 'PATCH') {
    const body = await parseBody(request, issuePatchSchema);
    return response(
      patchIssue(
        sql,
        storage,
        actor,
        workspaceId,
        issueId,
        operationId,
        await hashPayload({ path: request.url, body }),
        body,
      ),
    );
  }
  if (request.method === 'DELETE') {
    const body = await parseBody(request, versionInputSchema);
    return response(
      deleteIssue(
        sql,
        storage,
        actor,
        workspaceId,
        issueId,
        operationId,
        await hashPayload({ path: request.url, body }),
        body.expectedVersion,
      ),
    );
  }
  return null;
}

async function issueRestore(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
): Promise<Response | null> {
  if (request.method !== 'POST') return null;
  const body = await parseBody(request, versionInputSchema);
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  return response(
    restoreIssue(
      sql,
      storage,
      actor,
      workspaceId,
      issueId,
      operationId,
      await hashPayload({ path: request.url, body }),
      body.expectedVersion,
    ),
  );
}

async function comments(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
  rest: string[],
): Promise<Response | null> {
  if (rest.length === 0 && request.method === 'GET')
    return response(listComments(sql, actor, workspaceId, issueId));
  if (rest.length === 0 && request.method === 'POST') {
    const body = await parseBody(request, newCommentSchema);
    const operationId = requireOperationId(
      request.headers.get('Idempotency-Key'),
    );
    return response(
      createComment(
        sql,
        storage,
        actor,
        workspaceId,
        issueId,
        operationId,
        await hashPayload({ path: request.url, body }),
        body,
      ),
      201,
    );
  }
  if (rest.length !== 1) return null;
  const commentId = rest[0];
  if (request.method === 'GET')
    return response(getComment(sql, actor, workspaceId, issueId, commentId));
  if (request.method !== 'PATCH' && request.method !== 'DELETE') return null;
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  if (request.method === 'PATCH') {
    const body = await parseBody(request, commentPatchSchema);
    return response(
      patchComment(
        sql,
        storage,
        actor,
        workspaceId,
        issueId,
        commentId,
        operationId,
        await hashPayload({ path: request.url, body }),
        body,
      ),
    );
  }
  if (request.method === 'DELETE') {
    const body = await parseBody(request, versionInputSchema);
    return response(
      deleteComment(
        sql,
        storage,
        actor,
        workspaceId,
        issueId,
        commentId,
        operationId,
        await hashPayload({ path: request.url, body }),
        body.expectedVersion,
      ),
    );
  }
  return null;
}

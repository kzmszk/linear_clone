import { listRelations } from '../issues/relations.ts';
import { listAttachments } from '../issues/attachments.ts';
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import {
  issueCreateRequestSchema,
  issuePatchRequestSchema,
  newCommentSchema,
  versionInputSchema,
} from '../../../../packages/contracts/src/index.ts';
import { hashPayload, requireOperationId } from '../mutations.ts';
import { parseBody, response } from './parse.ts';
import {
  listActivity,
  listComments,
  getComment,
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
import { issueListResponse } from './issue-list.ts';
import {
  resolveIssueCreateReferences,
  resolveIssuePatchReferences,
} from '../issues/references.ts';
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
    return issueListResponse(request, sql, actor, workspaceId);
  if (request.method !== 'POST') return null;
  const body = await parseBody(request, issueCreateRequestSchema);
  const operationId = requireOperationId(
    request.headers.get('Idempotency-Key'),
  );
  const requestHash = await hashPayload({ path: request.url, body });
  const input = resolveIssueCreateReferences(sql, actor, workspaceId, body);
  return response(
    createIssue(
      sql,
      storage,
      actor,
      workspaceId,
      operationId,
      requestHash,
      input,
    ),
    201,
  );
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
    const body = await parseBody(request, issuePatchRequestSchema);
    const requestHash = await hashPayload({ path: request.url, body });
    const current = getIssue(sql, actor, workspaceId, issueId);
    const patch = resolveIssuePatchReferences(
      sql,
      actor,
      workspaceId,
      current.teamId,
      body,
    );
    return response(
      patchIssue(
        sql,
        storage,
        actor,
        workspaceId,
        current.id,
        operationId,
        requestHash,
        patch,
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
    const requestHash = await hashPayload({ path: request.url, body });
    const resolvedIssueId = getIssue(sql, actor, workspaceId, issueId).id;
    return response(
      createComment(
        sql,
        storage,
        actor,
        workspaceId,
        resolvedIssueId,
        operationId,
        requestHash,
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

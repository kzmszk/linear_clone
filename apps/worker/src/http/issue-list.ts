import { badRequest } from '../errors.ts';
import { one, parseBoolean } from '../db.ts';
import { hashPayload } from '../mutations.ts';
import { requireMembership } from '../organization/authentication.ts';
import { listIssues } from '../issues/queries.ts';
import type { IssueLifecycle, IssueListFilter } from '../issues/inputs.ts';
import type { AuthActor, SqlDb } from '../types.ts';

export async function issueListResponse(
  request: Request,
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
): Promise<Response> {
  const filter = issueListFilter(new URL(request.url));
  const queryHash = await hashPayload(filter);
  const member = requireMembership(sql, actor, workspaceId);
  const settings = one<{ sequence: number }>(
    sql,
    'SELECT sequence FROM installation_settings WHERE id = 1',
  );
  if (settings === null) throw new Error('Installation settings are missing');
  const etag = `"issues-v1-${member.user_id}-${workspaceId}-${queryHash}-${settings.sequence}"`;
  const headers = { ETag: etag, 'Cache-Control': 'private, no-cache' };
  const validator = request.headers.get('If-None-Match');
  if (validator === etag || validator === `W/${etag}`)
    return new Response(null, { status: 304, headers });
  const page = listIssues(sql, actor, workspaceId, filter);
  return Response.json(page, { headers });
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

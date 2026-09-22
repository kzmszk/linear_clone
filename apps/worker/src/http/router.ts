import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { notFound } from '../errors.ts';
import { routeOrganization } from './organization-routes.ts';
import { routeIssues } from './issue-routes.ts';
import { routeImports } from './import-routes.ts';
import { routeChanges } from './change-routes.ts';
import { routeSync } from './sync-route.ts';
import { apiPathSegments } from './path.ts';
import { openWorkspaceEvents } from '../changes/events.ts';
import { resolveWorkspaceId } from '../organization/queries.ts';
import type { AuthActor, SqlDb, WorkerEnv } from '../types.ts';

export async function routeTrackerRequest(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  env: WorkerEnv,
  state: DurableObjectState,
): Promise<Response> {
  const url = new URL(request.url);
  const rawSegments = apiPathSegments(url.pathname);
  if (rawSegments === null) throw notFound();
  const segments = canonicalWorkspacePath(sql, actor, rawSegments);
  const organization = await routeOrganization(
    request,
    sql,
    storage,
    actor,
    segments,
    env.BOOTSTRAP_OWNER_EMAIL,
  );
  if (organization !== null) return organization;
  const sync = await routeSyncPath(request, sql, storage, actor, segments);
  if (sync !== null) return sync;
  return routeWorkspaceRequest(request, sql, storage, actor, state, segments);
}

async function routeSyncPath(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  segments: string[],
): Promise<Response | null> {
  if (segments[0] !== 'workspaces') return null;
  if (segments[2] !== 'sync') return null;
  if (segments.length !== 3) return null;
  return routeSync(request, sql, storage, actor, segments[1]);
}

function canonicalWorkspacePath(
  sql: SqlDb,
  actor: AuthActor,
  segments: string[],
): string[] {
  if (segments[0] !== 'workspaces' || segments.length < 2) return segments;
  return [
    segments[0],
    resolveWorkspaceId(sql, actor, segments[1]),
    ...segments.slice(2),
  ];
}

async function routeWorkspaceRequest(
  request: Request,
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  state: DurableObjectState,
  segments: string[],
): Promise<Response> {
  if (segments[0] !== 'workspaces' || segments.length < 3) throw notFound();
  const workspaceId = segments[1];
  const rest = segments.slice(3);
  if (segments[2] === 'issues') {
    const result = await routeIssues(
      request,
      sql,
      storage,
      actor,
      workspaceId,
      rest,
    );
    if (result !== null) return result;
  }
  if (segments[2] === 'imports') {
    const result = await routeImports(
      request,
      sql,
      storage,
      actor,
      workspaceId,
      rest,
    );
    if (result !== null) return result;
  }
  if (segments[2] === 'changes') {
    const result = routeChanges(
      request,
      sql,
      storage,
      actor,
      workspaceId,
      rest,
    );
    if (result !== null) return result;
  }
  if (segments[2] === 'events' && segments.length === 3)
    return openWorkspaceEvents(request, sql, state, actor, workspaceId);
  throw notFound();
}

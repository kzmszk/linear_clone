import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { listChanges } from '../changes/queries.ts';
import { response } from './parse.ts';
import type { AuthActor, SqlDb } from '../types.ts';

export function routeChanges(
  request: Request,
  sql: SqlDb,
  _storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  rest: string[],
): Response | null {
  if (rest.length !== 0 || request.method !== 'GET') return null;
  return response(listChanges(sql, actor, workspaceId, new URL(request.url)));
}

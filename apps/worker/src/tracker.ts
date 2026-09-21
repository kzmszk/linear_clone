import { DurableObject } from 'cloudflare:workers';
import { initializeSchema } from '../migrations/schema.ts';
import { broadcastChanges } from './changes/events.ts';
import { errorResponse, unauthorized } from './errors.ts';
import { activateInvitedActor } from './organization/authentication.ts';
import { routeTrackerRequest } from './http/router.ts';
import type { AuthActor, WorkerEnv } from './types.ts';

export class Tracker extends DurableObject<WorkerEnv> {
  private readonly sql: SqlStorage;
  private readonly storage: DurableObjectStorage;
  private readonly durableState: DurableObjectState;
  private readonly config: WorkerEnv;
  private readonly ready: Promise<void>;

  constructor(state: DurableObjectState, env: WorkerEnv) {
    super(state, env);
    this.sql = state.storage.sql;
    this.storage = state.storage;
    this.durableState = state;
    this.config = env;
    this.ready = state.blockConcurrencyWhile(async () => {
      initializeSchema(this.sql, this.storage);
    });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      await this.ready;
      const actor = readActor(request);
      const previousSequence = currentSequence(this.sql);
      activateInvitedActor(this.sql, this.storage, actor);
      const response = await routeTrackerRequest(
        request,
        this.sql,
        this.storage,
        actor,
        this.config,
        this.durableState,
      );
      if (response.status < 300)
        broadcastChanges(this.sql, this.durableState, previousSequence);
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  }

  webSocketMessage(): void {
    // Client messages are intentionally ignored; changes are server-originated.
  }
}

function currentSequence(sql: SqlStorage): number {
  return (
    sql
      .exec<{ sequence: number }>(
        'SELECT sequence FROM installation_settings WHERE id = 1',
      )
      .toArray()[0]?.sequence ?? 0
  );
}

function readActor(request: Request): AuthActor {
  const issuer = request.headers.get('X-Linc-Actor-Issuer');
  const subject = request.headers.get('X-Linc-Actor-Subject');
  const email = request.headers.get('X-Linc-Actor-Email');
  if (issuer === null || subject === null || email === null)
    throw unauthorized();
  return { issuer, subject, email };
}

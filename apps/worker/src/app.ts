import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { syncRequestMaxBytes } from '../../../packages/contracts/src/sync.ts';
import { errorResponse, payloadTooLarge } from './errors.ts';
import { verifyMutationOrigin } from './auth.ts';
import { handleIssueFile } from './files/routes.ts';
import { apiPathSegments } from './http/path.ts';
import type { AuthActor, WorkerEnv } from './types.ts';

export type Authenticator = (
  request: Request,
  env: WorkerEnv,
) => Promise<AuthActor>;

export function createApp(
  authenticate: Authenticator,
): Hono<{ Bindings: WorkerEnv }> {
  const app = new Hono<{ Bindings: WorkerEnv }>();
  const limitSyncBody = bodyLimit({
    maxSize: syncRequestMaxBytes,
    onError: () => errorResponse(payloadTooLarge()),
  });
  app.use('*', (context, next) => {
    const segments = apiPathSegments(context.req.path);
    const isSync =
      segments?.length === 3 &&
      segments[0] === 'workspaces' &&
      segments[2] === 'sync';
    return isSync ? limitSyncBody(context, next) : next();
  });
  app.all('*', async (context) => {
    if (!context.req.path.startsWith('/api/'))
      return context.env.ASSETS.fetch(context.req.raw);
    if (context.req.method === 'OPTIONS')
      return new Response(null, { status: 204 });
    try {
      if (
        (context.req.method !== 'GET' && context.req.method !== 'HEAD') ||
        context.req.header('Upgrade')?.toLowerCase() === 'websocket'
      )
        verifyMutationOrigin(context.req.raw);
      const actor = await authenticate(context.req.raw, context.env);
      const id = context.env.TRACKER.idFromName('installation');
      const tracker = context.env.TRACKER.get(id);
      const headers = new Headers(context.req.raw.headers);
      headers.set('X-Linc-Actor-Issuer', actor.issuer);
      headers.set('X-Linc-Actor-Subject', actor.subject);
      headers.set('X-Linc-Actor-Email', actor.email);
      const forwarded = new Request(context.req.raw, { headers });
      const fileResponse = await handleIssueFile(
        forwarded,
        context.env,
        tracker,
      );
      return fileResponse ?? tracker.fetch(forwarded);
    } catch (error) {
      return errorResponse(error);
    }
  });
  app.notFound((context) => context.env.ASSETS.fetch(context.req.raw));
  return app;
}

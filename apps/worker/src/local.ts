import { createApp } from './app.ts';
import { principalSchema } from '../../../packages/contracts/src/index.ts';
import { unauthorized } from './errors.ts';
import type { AuthActor, WorkerEnv } from './types.ts';

const app = createApp(authenticateLocal);

export { Tracker } from './tracker.ts';
export default app;

export function authenticateLocal(
  request: Request,
  env: WorkerEnv,
): Promise<AuthActor> {
  const email = (
    request.headers.get('x-test-email') ??
    env.BOOTSTRAP_OWNER_EMAIL ??
    'owner@example.test'
  ).toLowerCase();
  const parsed = principalSchema.safeParse({
    subject: request.headers.get('x-test-subject') ?? email,
    email,
  });
  if (!parsed.success)
    return Promise.reject(unauthorized('x-test-email must be a valid email'));
  return Promise.resolve({
    issuer: 'local',
    subject: parsed.data.subject,
    email: parsed.data.email,
  });
}

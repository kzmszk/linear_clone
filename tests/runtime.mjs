import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function startRuntime(port = 8899, options = {}) {
  const storage = await mkdtemp(path.join(tmpdir(), 'linc-test-'));
  const url = `http://127.0.0.1:${port}`;
  let output = '';
  const child = spawn(
    'pnpm',
    [
      'exec',
      'wrangler',
      'dev',
      '--config',
      options.config ?? 'wrangler.local.jsonc',
      '--inspector-port',
      '0',
      '--port',
      String(port),
      '--persist-to',
      storage,
      ...(options.args ?? []),
    ],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    },
  );
  child.stdout.on('data', (chunk) => {
    output = (output + chunk).slice(-12000);
  });
  child.stderr.on('data', (chunk) => {
    output = (output + chunk).slice(-12000);
  });
  async function stop() {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    await delay(300);
    await rm(storage, { recursive: true, force: true });
  }
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/v1/me`, {
        headers: options.headers ?? { 'x-test-email': 'owner@example.test' },
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return { url, stop, output: () => output };
    } catch {
      /* The real runtime needs a short startup window. */
    }
    if (child.exitCode !== null) break;
    await delay(250);
  }
  await stop();
  throw new Error(`Worker failed to start: ${output}`);
}
export function api(url, email = 'owner@example.test') {
  return async (
    route,
    { method = 'GET', body, operationId = crypto.randomUUID() } = {},
  ) => {
    const response = await fetch(`${url}/api/v1${route}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-test-email': email,
        'Idempotency-Key': operationId,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
}
export async function seed(request) {
  const bootstrap = await request('/bootstrap', {
    method: 'POST',
    body: { slug: 'development', name: 'Development' },
  });
  if (bootstrap.status >= 400) throw new Error(JSON.stringify(bootstrap));
  const workspaceId = bootstrap.body.current.id;
  const created = await request(`/workspaces/${workspaceId}/teams`, {
    method: 'POST',
    body: { key: 'DEV', name: 'Engineering' },
  });
  if (created.status >= 400) throw new Error(JSON.stringify(created));
  return {
    workspaceId,
    team: created.body.current,
    base: `/workspaces/${workspaceId}`,
  };
}

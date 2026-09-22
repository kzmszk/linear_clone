import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

test('import endpoint rejects malformed file metadata before creating a run', async () => {
  const runtime = await startRuntime(8906);
  try {
    const request = api(runtime.url);
    const target = await seed(request);
    const response = await request(`${target.base}/imports`, {
      method: 'POST',
      body: {
        runId: crypto.randomUUID(),
        provider: 'linear',
        sourceWorkspaceId: crypto.randomUUID(),
        kind: 'attachment',
        items: [
          {
            sourceId: crypto.randomUUID(),
            sourceRevision: '2024-02-02T03:04:05.000Z',
            payload: { id: crypto.randomUUID() },
            file: {
              sourceId: crypto.randomUUID(),
              sourceUrl: 'https://linear.app/file',
              size: 'not-a-number',
            },
          },
        ],
      },
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'invalid_input');
    assert.match(response.body.error.message, /number/);

    const runs = await request(`${target.base}/imports`);
    assert.equal(runs.status, 200);
    assert.deepEqual(runs.body, []);
  } finally {
    await runtime.stop();
  }
});

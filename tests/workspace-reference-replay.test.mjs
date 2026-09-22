import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

test('reusing a workspace slug cannot replay another workspace mutation', async () => {
  const runtime = await startRuntime(8923);
  try {
    const request = api(runtime.url);
    const fixture = await seed(request);
    const command = {
      method: 'POST',
      operationId: crypto.randomUUID(),
      body: { key: 'SECRET', name: 'Original private team', private: true },
    };
    const first = await request('/workspaces/development/teams', command);
    assert.equal(first.status, 201);
    const replay = await request('/workspaces/development/teams', command);
    assert.equal(replay.body.kind, 'replayed');
    assert.equal(replay.body.current.id, first.body.current.id);
    const renamed = await request(fixture.base, {
      method: 'PATCH',
      body: { expectedVersion: 1, slug: 'original-workspace' },
    });
    assert.equal(renamed.status, 200);
    const second = await request('/workspaces', {
      method: 'POST',
      body: { name: 'Replacement workspace', slug: 'development' },
    });
    assert.equal(second.status, 201);
    const reused = await request('/workspaces/development/teams', command);
    assert.equal(reused.status, 409);
    assert.equal(reused.body.error.code, 'idempotency_reused');
    assert.equal(reused.body.current, undefined);
    const replacementTeams = await request(
      `/workspaces/${second.body.current.id}/teams`,
    );
    assert.deepEqual(replacementTeams.body, []);
    const originalTeams = await request(`${fixture.base}/teams`);
    assert.deepEqual(originalTeams.body.map(({ key }) => key).sort(), [
      'DEV',
      'SECRET',
    ]);
  } finally {
    await runtime.stop();
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { api, seed, startRuntime } from './runtime.mjs';

test('100 concurrent creates, retries and updates preserve all results', async () => {
  const runtime = await startRuntime(8900);
  try {
    const request = api(runtime.url);
    const fixture = await seed(request);
    const commands = Array.from({ length: 100 }, (_, i) => ({
      operationId: crypto.randomUUID(),
      method: 'POST',
      body: {
        teamId: fixture.team.id,
        title: `Concurrent ${i}`,
        description: `Body ${i}`,
      },
    }));
    const started = performance.now();
    const created = await Promise.all(
      commands.map((command) => request(`${fixture.base}/issues`, command)),
    );
    for (const result of created)
      assert.ok(result.status < 300, JSON.stringify(result));
    assert.equal(
      new Set(created.map((result) => result.body.current.identifier)).size,
      100,
    );
    const replayed = await Promise.all(
      commands.map((command) => request(`${fixture.base}/issues`, command)),
    );
    assert.ok(replayed.every((result) => result.body.kind === 'replayed'));
    const updated = await Promise.all(
      created.map((result, i) =>
        request(`${fixture.base}/issues/${result.body.current.id}`, {
          method: 'PATCH',
          body: { title: `Updated ${i}`, expectedVersion: 1 },
        }),
      ),
    );
    for (const [i, result] of updated.entries()) {
      assert.equal(result.body.current.title, `Updated ${i}`);
      assert.equal(result.body.current.version, 2);
      const stored = await request(
        `${fixture.base}/issues/${result.body.current.id}`,
      );
      assert.equal(stored.body.title, `Updated ${i}`);
      assert.equal(stored.body.description, `Body ${i}`);
    }
    const target = updated[0].body.current;
    const contenders = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        request(`${fixture.base}/issues/${target.id}`, {
          method: 'PATCH',
          body: { title: `Contender ${i}`, expectedVersion: 2 },
        }),
      ),
    );
    assert.equal(contenders.filter((result) => result.status < 300).length, 1);
    assert.equal(
      contenders.filter((result) => result.status === 409).length,
      99,
    );
    process.stdout.write(
      `${JSON.stringify({ creates: 100, updates: 100, replays: 100, contentionConflicts: 99, elapsedMs: Math.round(performance.now() - started) })}\n`,
    );
  } finally {
    await runtime.stop();
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

test('label deletion replays the same request without another write', async () => {
  const runtime = await startRuntime(8925);
  try {
    const owner = api(runtime.url);
    const { base } = await seed(owner);
    const created = await owner(`${base}/labels`, {
      method: 'POST',
      body: { name: 'Review' },
    });
    assert.equal(created.status, 201);
    const label = created.body.current;
    const route = `${base}/labels/${label.id}`;
    const operationId = crypto.randomUUID();
    const deletion = {
      method: 'DELETE',
      operationId,
      body: { expectedVersion: label.version },
    };

    const first = await owner(route, deletion);
    assert.equal(first.status, 200);
    assert.equal(first.body.kind, 'committed');
    const replay = await owner(route, deletion);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.kind, 'replayed');
    assert.deepEqual(replay.body.receipt, first.body.receipt);
    assert.equal(replay.body.current.version, first.body.current.version);
    assert.equal(replay.body.current.updatedAt, first.body.current.updatedAt);

    const reused = await owner(route, {
      ...deletion,
      body: { expectedVersion: first.body.current.version },
    });
    assert.equal(reused.status, 409);
    assert.equal(reused.body.error.code, 'idempotency_reused');
    const differentMethod = await owner(route, {
      method: 'PATCH',
      operationId,
      body: { expectedVersion: label.version },
    });
    assert.equal(differentMethod.status, 409);
    assert.equal(differentMethod.body.error.code, 'idempotency_reused');
    const stale = await owner(route, {
      ...deletion,
      operationId: crypto.randomUUID(),
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'version_conflict');

    const member = await owner(`${base}/members`, {
      method: 'POST',
      body: { email: 'reader@example.test', name: 'Reader', role: 'member' },
    });
    assert.equal(member.status, 201);
    const reader = api(runtime.url, 'reader@example.test');
    assert.equal((await reader('/me')).status, 200);
    const denied = await reader(route, {
      method: 'DELETE',
      body: { expectedVersion: first.body.current.version },
    });
    assert.equal(denied.status, 403);
    assert.equal(
      (await owner(`${base}/labels`)).body.some((item) => item.id === label.id),
      false,
    );
  } finally {
    await runtime.stop();
  }
});

test('archived labels remain on existing issues but cannot be newly assigned', async () => {
  const runtime = await startRuntime(8935);
  try {
    const owner = api(runtime.url);
    const { base, team } = await seed(owner);
    const label = (
      await owner(`${base}/labels`, {
        method: 'POST',
        body: { name: 'Review' },
      })
    ).body.current;
    const first = (
      await owner(`${base}/issues`, {
        method: 'POST',
        body: { teamId: team.id, title: 'Tagged', labelIds: [label.id] },
      })
    ).body.current;
    const second = (
      await owner(`${base}/issues`, {
        method: 'POST',
        body: { teamId: team.id, title: 'Untagged' },
      })
    ).body.current;
    assert.equal(
      (
        await owner(`${base}/labels/${label.id}`, {
          method: 'DELETE',
          body: { expectedVersion: label.version },
        })
      ).status,
      200,
    );
    const renamed = await owner(`${base}/issues/${first.id}`, {
      method: 'PATCH',
      body: { expectedVersion: first.version, title: 'Still tagged' },
    });
    assert.equal(renamed.status, 200);
    assert.deepEqual(renamed.body.current.labelIds, [label.id]);
    const rejected = await owner(`${base}/issues/${second.id}`, {
      method: 'PATCH',
      body: { expectedVersion: second.version, labelIds: [label.id] },
    });
    assert.equal(rejected.status, 404);
    assert.deepEqual(
      (await owner(`${base}/issues/${second.id}`)).body.labelIds,
      [],
    );
    const restored = await owner(`${base}/labels`, {
      method: 'POST',
      body: { name: 'Review', color: '#aabbcc' },
    });
    assert.equal(restored.status, 201);
    assert.equal(restored.body.current.id, label.id);
    assert.equal(
      (await owner(`${base}/labels`)).body.some((item) => item.id === label.id),
      true,
    );
    assert.deepEqual(
      (await owner(`${base}/issues/${first.id}`)).body.labelIds,
      [label.id],
    );
  } finally {
    await runtime.stop();
  }
});

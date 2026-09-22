import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

let runtime, request, fixture;
beforeEach(async () => {
  runtime = await startRuntime(8907);
  request = api(runtime.url);
  fixture = await seed(request);
});
afterEach(async () => {
  await runtime?.stop();
});

test('restarting a Worker preserves writes and replays receipts without duplicating changes', async () => {
  const path = `${fixture.base}/issues`;
  const create = {
    method: 'POST',
    operationId: crypto.randomUUID(),
    body: {
      teamId: fixture.team.id,
      title: 'Original',
      description: '日本語 **本文**',
    },
  };
  const created = await request(path, create);
  assert.equal(created.status, 201);
  const issuePath = `${path}/${created.body.current.id}`;
  const update = {
    method: 'PATCH',
    operationId: crypto.randomUUID(),
    body: { expectedVersion: 1, title: 'Saved before restart' },
  };
  const updated = await request(issuePath, update);
  assert.equal(updated.status, 200);
  const activity = await request(`${issuePath}/activity`);
  assert.equal(activity.status, 200);

  await runtime.restart();

  const saved = await request(issuePath);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.title, 'Saved before restart');
  assert.equal(saved.body.description, '日本語 **本文**');
  assert.equal(saved.body.version, 2);
  for (const [url, command, original] of [
    [path, create, created],
    [issuePath, update, updated],
  ]) {
    const replay = await request(url, command);
    assert.equal(replay.status, original.status);
    assert.equal(replay.body.kind, 'replayed');
    assert.deepEqual(replay.body.receipt, original.body.receipt);
    assert.equal(replay.body.current.version, 2);
  }
  const collision = await request(path, {
    ...create,
    body: { ...create.body, title: 'Wrong payload' },
  });
  assert.equal(collision.status, 409);
  assert.equal(collision.body.error.code, 'idempotency_reused');
  assert.deepEqual(
    (await request(`${issuePath}/activity`)).body,
    activity.body,
  );
  const list = await request(path);
  assert.deepEqual(
    list.body.items.map((issue) => issue.title),
    ['Saved before restart'],
  );
  const next = await request(path, {
    method: 'POST',
    body: { ...create.body, title: 'Next issue' },
  });
  assert.equal(next.status, 201);
  assert.equal(next.body.current.identifier, 'DEV-2');
});

test('deleted issues and private attachment bytes survive restart and restore', async () => {
  const created = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: fixture.team.id, title: 'Durable attachment' },
  });
  assert.equal(created.status, 201);
  const issuePath = `${fixture.base}/issues/${created.body.current.id}`;
  const uploaded = await fetch(`${runtime.url}/api/v1${issuePath}/files`, {
    method: 'POST',
    headers: {
      'x-test-email': 'owner@example.test',
      'Content-Type': 'text/plain',
    },
    body: 'Persistent file 日本語\n',
  });
  assert.equal(uploaded.status, 201);
  const file = await uploaded.json();
  const deletion = {
    method: 'DELETE',
    operationId: crypto.randomUUID(),
    body: { expectedVersion: 1 },
  };
  const removed = await request(issuePath, deletion);
  assert.equal(removed.status, 200);
  assert.ok(removed.body.current.deletedAt);

  await runtime.restart();

  const replay = await request(issuePath, deletion);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.kind, 'replayed');
  assert.deepEqual(replay.body.receipt, removed.body.receipt);
  assert.equal(replay.body.current.deletedAt, removed.body.current.deletedAt);
  assert.deepEqual((await request(`${fixture.base}/issues`)).body.items, []);
  const restored = await request(`${issuePath}/restore`, {
    method: 'POST',
    body: { expectedVersion: 2 },
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.current.deletedAt, null);
  assert.equal(restored.body.current.title, 'Durable attachment');
  assert.equal(restored.body.current.version, 3);
  const downloaded = await fetch(`${runtime.url}${file.url}`, {
    headers: { 'x-test-email': 'owner@example.test' },
  });
  assert.equal(downloaded.status, 200);
  assert.equal(await downloaded.text(), 'Persistent file 日本語\n');
  const denied = await fetch(`${runtime.url}${file.url}`, {
    headers: { 'x-test-email': 'outsider@example.test' },
  });
  assert.equal(denied.status, 404);
});

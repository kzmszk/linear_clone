import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

let runtime;
let request;
let fixture;

beforeEach(async () => {
  runtime = await startRuntime(8938);
  request = api(runtime.url);
  fixture = await seed(request);
});

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  request = null;
  fixture = null;
});

test('returns null at an unchanged sequence and refreshes after a remote write', async () => {
  const initial = await sync({ operations: [] });
  assert.equal(initial.status, 200, JSON.stringify(initial));
  assert.ok(initial.body.snapshot);
  const idle = await sync({
    operations: [],
    afterSequence: initial.body.sequence,
  });
  assert.equal(idle.status, 200, JSON.stringify(idle));
  assert.equal(idle.body.snapshot, null);
  assert.deepEqual(idle.body.principal, initial.body.principal);
  assert.equal(idle.body.workspaceId, fixture.workspaceId);
  assert.equal(idle.body.sequence, initial.body.sequence);

  const remote = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: fixture.team.id, title: 'Remote change' },
  });
  assert.equal(remote.status, 201, JSON.stringify(remote));
  const changed = await sync({
    operations: [],
    afterSequence: initial.body.sequence,
  });
  assert.equal(changed.status, 200, JSON.stringify(changed));
  assert.ok(changed.body.snapshot);
  assert.ok(changed.body.sequence > initial.body.sequence);
  assert.ok(
    changed.body.snapshot.issues.some(
      (issue) => issue.title === 'Remote change',
    ),
  );
});

test('rejects an oversized sync request before parsing its JSON', async () => {
  const oversized = 'x'.repeat(8 * 1024 * 1024 + 1);
  for (const [route, streamed] of [
    [`${fixture.base}/sync`, false],
    [`${fixture.base}/sync`, true],
    [`${fixture.base}/sync/`, true],
    [`/workspaces//${fixture.workspaceId}//sync///`, true],
  ]) {
    const body = streamed
      ? new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(oversized));
            controller.close();
          },
        })
      : oversized;
    const result = await fetch(`${runtime.url}/api/v1${route}`, {
      method: 'POST',
      headers: {
        'x-test-email': 'owner@example.test',
        'content-type': 'application/json',
      },
      body,
      duplex: 'half',
    });
    assert.equal(result.status, 413);
    assert.equal((await result.json()).error.code, 'payload_too_large');
  }
});

function sync(body) {
  return request(`${fixture.base}/sync`, {
    method: 'POST',
    body,
  });
}

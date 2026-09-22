import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, test } from 'node:test';
import { localSession } from './local-cli-runtime.mjs';

let session;
beforeEach(async () => {
  session = await localSession();
  const initialized = await session.cli(['init']);
  assert.equal(initialized.code, 0, initialized.stderr);
});
afterEach(async () => {
  await session?.stop();
  session = undefined;
});

async function success(args, options = {}) {
  const result = await session.cli(args, options);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  return result.value;
}

async function create(title) {
  return success(['issue', 'create', '--team', 'DEV', '--title', title], {
    offline: true,
  });
}

async function remoteIssues() {
  const result = await session.request(`${session.fixture.base}/issues`);
  assert.equal(result.status, 200);
  return result.body.items;
}

test('offline issue, status and comment writes survive restart and synchronize in one request', async () => {
  const before = session.bridge.count();
  const created = await create('Offline work');
  assert.match(created.identifier, /^LOCAL-/);
  assert.equal(created.syncState, 'pending');
  const updated = await success(
    ['issue', 'update', created.id, '--state', 'In Progress'],
    { offline: true },
  );
  assert.equal(updated.version, 2);
  const comment = await success(
    ['issue', 'comment', 'create', created.id, '--body', 'Written offline'],
    { offline: true },
  );
  const rows = await success(['issue', 'list'], { offline: true });
  assert.equal(rows.find((row) => row.id === created.id).title, 'Offline work');
  assert.equal(session.bridge.count(), before);
  assert.equal((await remoteIssues()).length, 0);
  const status = await success(['status'], { offline: true });
  assert.equal(status.pending, 3);
  const synced = await success(['sync']);
  assert.equal(synced.accepted, 3);
  assert.equal(synced.pending, 0);
  assert.equal(session.bridge.count(), before + 1);
  const saved = (await remoteIssues()).find((row) => row.id === created.id);
  assert.equal(saved.identifier, 'DEV-1');
  assert.equal(saved.version, 2);
  const comments = await session.request(
    `${session.fixture.base}/issues/${saved.id}/comments`,
  );
  assert.equal(comments.body[0].id, comment.id);
  assert.equal(comments.body[0].body, 'Written offline');
  const local = await success(['issue', 'get', created.id], { offline: true });
  assert.equal(local.identifier, 'DEV-1');
  assert.equal(local.syncState, 'synced');
});

test('a lost sync response can be retried without duplicating issues or comments', async () => {
  const created = await create('Response lost');
  await success(
    ['issue', 'comment', 'create', created.id, '--body', 'Only once'],
    { offline: true },
  );
  session.bridge.dropNext();
  const failed = await session.cli(['sync']);
  assert.notEqual(failed.code, 0);
  assert.equal((await success(['status'])).pending, 2);
  assert.equal((await remoteIssues()).length, 1);
  const retried = await success(['sync']);
  assert.equal(retried.pending, 0);
  assert.equal((await remoteIssues()).length, 1);
  const comments = await session.request(
    `${session.fixture.base}/issues/${created.id}/comments`,
  );
  assert.deepEqual(
    comments.body.map((row) => row.body),
    ['Only once'],
  );
});

test('a remote conflict preserves both remote values and the local pending intent', async () => {
  const created = await create('Original title');
  await success(['sync']);
  await success(['issue', 'update', created.id, '--title', 'Local intention'], {
    offline: true,
  });
  const changed = await session.request(
    `${session.fixture.base}/issues/${created.id}`,
    {
      method: 'PATCH',
      body: { expectedVersion: 1, title: 'Web change' },
    },
  );
  assert.equal(changed.status, 200);
  const conflict = await session.cli(['sync']);
  assert.equal(conflict.code, 2);
  assert.equal(conflict.value.failure.code, 'version_conflict');
  assert.equal(conflict.value.pending, 1);
  assert.equal((await remoteIssues())[0].title, 'Web change');
  const local = await success(['issue', 'get', created.id], { offline: true });
  assert.equal(local.title, 'Local intention');
  const status = await success(['status'], { offline: true });
  assert.match(JSON.stringify(status), /Local intention/);
  const again = await session.cli(['sync']);
  assert.equal(again.code, 2);
  assert.equal((await remoteIssues())[0].title, 'Web change');
});

test('local commands can save while sync waits for the network response', async () => {
  await create('First queued issue');
  const hold = session.bridge.holdNext();
  const syncing = session.cli(['sync']);
  await hold.reached;
  try {
    const during = await create('Saved during synchronization');
    const visible = await success(['issue', 'get', during.id], {
      offline: true,
    });
    assert.equal(visible.title, 'Saved during synchronization');
  } finally {
    hold.release();
  }
  const result = await syncing;
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.value.pending, 1);
  const local = await success(['issue', 'list'], { offline: true });
  assert.deepEqual(local.map((row) => row.title).sort(), [
    'First queued issue',
    'Saved during synchronization',
  ]);
  await success(['sync']);
  assert.deepEqual((await remoteIssues()).map((row) => row.title).sort(), [
    'First queued issue',
    'Saved during synchronization',
  ]);
});

test('100 concurrent local creates persist and are pushed together', async () => {
  const results = await Promise.all(
    Array.from({ length: 100 }, (_, index) => create(`Concurrent ${index}`)),
  );
  assert.equal(new Set(results.map((row) => row.id)).size, 100);
  assert.equal(
    (await success(['issue', 'list'], { offline: true })).length,
    100,
  );
  assert.equal((await success(['status'], { offline: true })).pending, 100);
  const before = session.bridge.count();
  const result = await success(['sync']);
  assert.equal(result.accepted, 100);
  assert.equal(result.pending, 0);
  assert.equal(session.bridge.count(), before + 1);
  const saved = await remoteIssues();
  assert.equal(saved.length, 100);
  assert.equal(new Set(saved.map((row) => row.identifier)).size, 100);
});

test('pulling remote state refreshes closed and deleted issues without losing lifecycle filters', async () => {
  const created = await create('Lifecycle');
  await success(['sync']);
  const metadata = await session.request(`${session.fixture.base}/metadata`);
  const done = metadata.body.states.find((state) => state.type === 'completed');
  const changed = await session.request(
    `${session.fixture.base}/issues/${created.id}`,
    {
      method: 'PATCH',
      body: { expectedVersion: 1, stateId: done.id },
    },
  );
  assert.equal(changed.status, 200);
  await success(['sync']);
  assert.deepEqual(await success(['issue', 'list']), []);
  assert.equal(
    (await success(['issue', 'list', '--closed']))[0].title,
    'Lifecycle',
  );
  const removed = await success(['issue', 'delete', created.id], {
    offline: true,
  });
  assert.equal(removed.version, 3);
  await success(['sync']);
  assert.equal(
    (await success(['issue', 'list', '--deleted']))[0].id,
    created.id,
  );
  await success(['issue', 'restore', created.id], { offline: true });
  await success(['sync']);
  assert.equal(
    (await success(['issue', 'list', '--all']))[0].title,
    'Lifecycle',
  );
});

test('a different local identity cannot read another account local database', async () => {
  await create('Owner private local draft');
  const other = await session.cli(['issue', 'list'], {
    offline: true,
    email: 'other@example.test',
  });
  assert.notEqual(other.code, 0);
  assert.equal(other.stdout.includes('Owner private local draft'), false);
  const owner = await success(['issue', 'list'], { offline: true });
  assert.equal(owner[0].title, 'Owner private local draft');
});

test('watch periodically sends later local writes and stops cleanly', async () => {
  await create('Before watch');
  const watch = session.watch();
  try {
    await waitForRemoteCount(1);
    await create('Next watch cycle');
    await waitForRemoteCount(2);
    assert.deepEqual((await remoteIssues()).map((row) => row.title).sort(), [
      'Before watch',
      'Next watch cycle',
    ]);
  } finally {
    watch.child.kill('SIGTERM');
  }
  const stopped = await watch.closed;
  assert.equal(stopped.code, 0, stopped.output);
  assert.equal((await success(['status'])).pending, 0);
});

async function waitForRemoteCount(count) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if ((await remoteIssues()).length === count) return;
    await delay(50);
  }
  assert.fail(`Watch did not synchronize ${count} issues`);
}

test('revoked team access removes remote records from the local view while retaining pending intent', async () => {
  const created = await create('Initially public');
  await success(['sync']);
  const invited = await session.request(`${session.fixture.base}/members`, {
    method: 'POST',
    body: {
      email: 'reader@example.test',
      name: 'Reader',
      role: 'member',
      teamIds: [],
    },
  });
  assert.equal(invited.status, 201);
  const reader = { email: 'reader@example.test' };
  await success(['init'], reader);
  await success(
    ['issue', 'update', created.id, '--title', 'Reader unsent edit'],
    { ...reader, offline: true },
  );
  const hidden = await session.request(
    `${session.fixture.base}/teams/${session.fixture.team.id}`,
    {
      method: 'PATCH',
      body: { expectedVersion: 1, private: true },
    },
  );
  assert.equal(hidden.status, 200);
  const result = await session.cli(['sync'], reader);
  assert.notEqual(result.code, 0);
  assert.equal(result.value.pending, 1);
  assert.deepEqual(await success(['issue', 'list'], reader), []);
  assert.match(
    JSON.stringify(await success(['status'], reader)),
    /Reader unsent edit/,
  );
});

test('discard withdraws unsent writes without sending them to the server', async () => {
  await create('Withdraw this draft');
  const result = await success(['discard', '--yes']);
  assert.equal(result.discarded, 1);
  assert.deepEqual(await remoteIssues(), []);
  assert.deepEqual(await success(['issue', 'list']), []);
  const status = await success(['status']);
  assert.equal(status.pending, 0);
  assert.match(JSON.stringify(status), /Withdraw this draft/);
});

test('discard after a lost response retains writes already committed remotely', async () => {
  const created = await create('Already committed');
  session.bridge.dropNext();
  assert.notEqual((await session.cli(['sync'])).code, 0);
  assert.equal((await success(['status'])).pending, 1);
  await success(['discard', '--yes']);
  assert.equal((await success(['status'])).pending, 0);
  const local = await success(['issue', 'get', created.id]);
  assert.equal(local.title, 'Already committed');
  assert.equal(local.syncState, 'synced');
  assert.equal((await remoteIssues()).length, 1);
});

test('discard clears a conflict so a newly entered update can synchronize', async () => {
  const created = await create('Original');
  await success(['sync']);
  await success(['issue', 'update', created.id, '--title', 'Withdrawn edit']);
  const changed = await session.request(
    `${session.fixture.base}/issues/${created.id}`,
    { method: 'PATCH', body: { expectedVersion: 1, title: 'Remote edit' } },
  );
  assert.equal(changed.status, 200);
  assert.equal((await session.cli(['sync'])).code, 2);
  await success(['discard', '--yes']);
  assert.equal(
    (await success(['issue', 'get', created.id])).title,
    'Remote edit',
  );
  await success(['issue', 'update', created.id, '--title', 'New edit']);
  const synced = await success(['sync']);
  assert.equal(synced.failure, null);
  assert.equal(synced.pending, 0);
  assert.equal((await remoteIssues())[0].title, 'New edit');
});

test('watch stops promptly during a long interval and a pending network response', async () => {
  for (const phase of ['interval', 'network']) {
    const hold = phase === 'network' ? session.bridge.holdNext() : null;
    const watch = session.watch(3600);
    try {
      await (hold ? hold.reached : watch.ready);
      watch.child.kill('SIGTERM');
      const stopped = await Promise.race([
        watch.closed,
        delay(2000).then(() => null),
      ]);
      assert.notEqual(stopped, null, `Watch did not stop during ${phase}`);
      assert.equal(stopped.code, 0, stopped.output);
    } finally {
      watch.child.kill('SIGKILL');
      hold?.release();
      await watch.closed;
    }
  }
  assert.equal((await success(['sync'])).pending, 0);
});

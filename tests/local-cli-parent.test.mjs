import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localSession } from './local-cli-runtime.mjs';

test('a parent cycle rejected by sync keeps the local pending edit', async () => {
  const session = await localSession();
  try {
    async function success(args, offline = false) {
      const result = await session.cli(args, { offline });
      assert.equal(result.code, 0, result.stderr || result.stdout);
      return result.value;
    }
    await success(['init']);
    const first = await success(
      ['issue', 'create', '--team', 'DEV', '--title', 'First parent'],
      true,
    );
    const second = await success(
      ['issue', 'create', '--team', 'DEV', '--title', 'Second parent'],
      true,
    );
    await success(['sync']);
    const attached = await success(
      ['issue', 'update', first.id, '--parent', second.id],
      true,
    );
    assert.equal(attached.parentId, second.id);
    assert.equal((await success(['sync'])).pending, 0);

    const pending = await success(
      ['issue', 'update', second.id, '--parent', first.id],
      true,
    );
    assert.equal(pending.parentId, first.id);
    const rejected = await session.cli(['sync']);
    assert.equal(rejected.code, 2);
    assert.equal(rejected.value.failure.code, 'parent_cycle');
    assert.equal(rejected.value.pending, 1);
    const remote = await session.request(
      `${session.fixture.base}/issues/${second.id}`,
    );
    assert.equal(remote.body.parentId, null);
    assert.equal(remote.body.version, second.version);
    const local = await success(['issue', 'get', second.id], true);
    assert.equal(local.parentId, first.id);
    assert.equal((await success(['status'], true)).pending, 1);
  } finally {
    await session.stop();
  }
});

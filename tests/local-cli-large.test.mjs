import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { localSession } from './local-cli-runtime.mjs';

test('a backlog larger than one request synchronizes in ordered batches', async () => {
  const session = await localSession();
  try {
    assert.equal((await session.cli(['init'])).code, 0);
    const description = path.join(session.state, 'description.txt');
    await writeFile(description, 'x'.repeat(1_000_000));
    for (let index = 0; index < 9; index += 1) {
      const created = await session.cli(
        [
          'issue',
          'create',
          '--team',
          'DEV',
          '--title',
          `Large ${index}`,
          '--description-file',
          description,
        ],
        { offline: true },
      );
      assert.equal(created.code, 0, created.stderr);
    }
    const before = session.bridge.count();
    const first = await session.cli(['sync']);
    assert.equal(first.code, 0, first.stderr);
    assert.equal(first.value.accepted, 8);
    assert.equal(first.value.pending, 1);
    const second = await session.cli(['sync']);
    assert.equal(second.code, 0, second.stderr);
    assert.equal(second.value.accepted, 1);
    assert.equal(second.value.pending, 0);
    assert.equal(session.bridge.count(), before + 2);
    const saved = await session.request(`${session.fixture.base}/issues`);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.items.length, 9);
    assert.deepEqual(
      saved.body.items.map((issue) => issue.title).sort(),
      Array.from({ length: 9 }, (_, index) => `Large ${index}`),
    );
    assert.ok(
      saved.body.items.every((issue) => issue.description.length === 1_000_000),
    );
  } finally {
    await session.stop();
  }
});

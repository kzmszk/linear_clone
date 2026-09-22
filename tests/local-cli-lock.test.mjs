import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { localSession } from './local-cli-runtime.mjs';

test('local commands wait for a brief database lock during workspace discovery', async () => {
  const session = await localSession();
  try {
    const initialized = await session.cli(['init']);
    assert.equal(initialized.code, 0, initialized.stderr);
    const created = await session.cli(
      [
        'issue',
        'create',
        '--team',
        'DEV',
        '--title',
        'Survives a database lock',
      ],
      { offline: true },
    );
    assert.equal(created.code, 0, created.stderr);
    const files = await readdir(session.state, { recursive: true });
    const database = files.find(
      (file) => file.endsWith('.sqlite') && !file.endsWith('.sync-lock.sqlite'),
    );
    assert.ok(database);
    const locker = new DatabaseSync(path.join(session.state, database));
    let released = false;
    function release() {
      if (released) return;
      locker.exec('ROLLBACK');
      locker.close();
      released = true;
    }
    locker.exec('PRAGMA locking_mode = EXCLUSIVE; BEGIN EXCLUSIVE;');
    const timer = setTimeout(release, 1000);
    let listed;
    try {
      listed = await session.cli(['issue', 'list'], { offline: true });
      assert.equal(listed.code, 0, listed.stderr);
      assert.equal(
        released,
        true,
        'The command must wait until the database becomes available',
      );
    } finally {
      clearTimeout(timer);
      release();
    }
    assert.deepEqual(
      listed.value.map((issue) => issue.title),
      ['Survives a database lock'],
    );
    const synced = await session.cli(['sync']);
    assert.equal(synced.code, 0, synced.stderr);
    assert.equal(synced.value.accepted, 1);
    const remote = await session.request(`${session.fixture.base}/issues`);
    assert.equal(remote.status, 200);
    assert.deepEqual(
      remote.body.items.map((issue) => issue.title),
      ['Survives a database lock'],
    );
  } finally {
    await session.stop();
  }
});

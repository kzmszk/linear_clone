import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { afterEach, beforeEach, test } from 'node:test';
import { promisify } from 'node:util';
import { api, seed, startRuntime } from './runtime.mjs';

const execute = promisify(execFile);
let runtime;
let fixture;

beforeEach(async () => {
  runtime = await startRuntime(8910);
  fixture = await seed(api(runtime.url));
});

afterEach(async () => {
  const activeRuntime = runtime;
  runtime = undefined;
  fixture = undefined;
  await activeRuntime?.stop();
});

async function cliAs(email, ...args) {
  const result = await execute(
    process.execPath,
    [
      'dist/cli/linc.mjs',
      '--url',
      runtime.url,
      '--test-email',
      email,
      '--workspace',
      fixture.workspaceId,
      '--json',
      ...args,
    ],
    { env: { ...process.env, XDG_CACHE_HOME: runtime.cacheHome } },
  );
  return JSON.parse(result.stdout);
}

function cli(...args) {
  return cliAs('owner@example.test', ...args);
}

test('compiled CLI creates, lists, updates and deletes issue comments', async () => {
  const issue = (
    await cli(
      'issue',
      'create',
      '--team',
      'DEV',
      '--title',
      'Comment lifecycle',
    )
  ).current;

  const created = await cli(
    'issue',
    'comment',
    'create',
    issue.identifier,
    '--body',
    'First comment\n\n- with context',
  );
  assert.equal(created.current.issueId, issue.id);
  assert.equal(created.current.body, 'First comment\n\n- with context');
  assert.equal(created.current.version, 1);

  const listed = await cli('issue', 'comment', 'list', issue.identifier);
  assert.deepEqual(listed, [created.current]);

  const updated = await cli(
    'issue',
    'comment',
    'update',
    issue.identifier,
    created.current.id,
    '--body',
    'Updated comment',
    '--expected-version',
    '1',
  );
  assert.equal(updated.current.body, 'Updated comment');
  assert.equal(updated.current.version, 2);

  const removed = await cli(
    'issue',
    'comment',
    'delete',
    issue.identifier,
    created.current.id,
    '--expected-version',
    '2',
  );
  assert.equal(removed.current.version, 3);
  assert.ok(removed.current.deletedAt);

  const listedAfterDelete = await cli(
    'issue',
    'comment',
    'list',
    issue.identifier,
  );
  assert.deepEqual(listedAfterDelete, [removed.current]);
});

test('stale comment updates exit 2 and preserve the stored comment', async () => {
  const issue = (
    await cli(
      'issue',
      'create',
      '--team',
      'DEV',
      '--title',
      'Stale comment update',
    )
  ).current;
  const comment = (
    await cli(
      'issue',
      'comment',
      'create',
      issue.identifier,
      '--body',
      'Original body',
    )
  ).current;
  const updated = await cli(
    'issue',
    'comment',
    'update',
    issue.identifier,
    comment.id,
    '--body',
    'Current body',
    '--expected-version',
    '1',
  );
  const before = await cli('issue', 'comment', 'list', issue.identifier);

  await assert.rejects(
    cli(
      'issue',
      'comment',
      'update',
      issue.identifier,
      comment.id,
      '--body',
      'Stale body',
      '--expected-version',
      '1',
    ),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(String(error.stderr), /version_conflict/);
      return true;
    },
  );

  assert.equal(updated.current.version, 2);
  assert.deepEqual(
    await cli('issue', 'comment', 'list', issue.identifier),
    before,
  );
  assert.equal(before[0].body, 'Current body');
});

test('comment commands reject cross-issue IDs and unauthorized principals', async () => {
  const issueA = (
    await cli(
      'issue',
      'create',
      '--team',
      'DEV',
      '--title',
      'First comment issue',
    )
  ).current;
  const issueB = (
    await cli(
      'issue',
      'create',
      '--team',
      'DEV',
      '--title',
      'Second comment issue',
    )
  ).current;
  const comment = (
    await cli(
      'issue',
      'comment',
      'create',
      issueA.identifier,
      '--body',
      'Issue A only',
    )
  ).current;

  await assert.rejects(
    cli(
      'issue',
      'comment',
      'update',
      issueB.identifier,
      comment.id,
      '--body',
      'Wrong issue',
    ),
    (error) => {
      assert.equal(error.code, 1);
      return true;
    },
  );
  assert.deepEqual(await cli('issue', 'comment', 'list', issueA.identifier), [
    comment,
  ]);
  assert.deepEqual(
    await cli('issue', 'comment', 'list', issueB.identifier),
    [],
  );

  await assert.rejects(
    cliAs(
      'outsider@example.test',
      'issue',
      'comment',
      'list',
      issueA.identifier,
    ),
    (error) => {
      assert.equal(error.code, 1);
      return true;
    },
  );
});

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { after, before, test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

const execute = promisify(execFile);
let runtime, fixture;
before(async () => {
  runtime = await startRuntime(8902);
  fixture = await seed(api(runtime.url));
});
after(async () => {
  await runtime?.stop();
});
async function cli(...args) {
  const result = await execute(process.execPath, [
    'dist/cli/linc.mjs',
    '--url',
    runtime.url,
    '--test-email',
    'owner@example.test',
    '--workspace',
    fixture.workspaceId,
    '--json',
    ...args,
  ]);
  return JSON.parse(result.stdout);
}

test('built CLI creates, reads, edits and deletes real Worker issues', async () => {
  const created = await cli(
    'issue',
    'create',
    '--team',
    'DEV',
    '--title',
    'CLIから登録',
    '--description',
    '本文 **Markdown**',
  );
  assert.equal(created.current.title, 'CLIから登録');
  const record = await cli('issue', 'get', created.current.identifier);
  assert.equal(record.description, '本文 **Markdown**');
  const updated = await cli(
    'issue',
    'update',
    record.identifier,
    '--title',
    'CLIから更新',
    '--expected-version',
    '1',
  );
  assert.equal(updated.current.version, 2);
  const response = await api(runtime.url)(
    `${fixture.base}/issues/${record.id}`,
  );
  assert.equal(response.body.title, 'CLIから更新');
  const removed = await cli(
    'issue',
    'delete',
    record.identifier,
    '--expected-version',
    '2',
  );
  assert.ok(removed.current.deletedAt);
  const restored = await cli(
    'issue',
    'restore',
    record.id,
    '--expected-version',
    '3',
  );
  assert.equal(restored.current.deletedAt, null);
});

test('built CLI management commands persist and conflict exits nonzero', async () => {
  const project = await cli(
    'project',
    'create',
    '--name',
    'Website',
    '--team',
    'DEV',
  );
  const updated = await cli(
    'project',
    'update',
    project.current.id,
    '--name',
    'New website',
  );
  assert.equal(updated.current.name, 'New website');
  await assert.rejects(
    cli(
      'project',
      'update',
      project.current.id,
      '--name',
      'Stale',
      '--expected-version',
      '1',
    ),
    (error) => {
      assert.equal(error.code, 2);
      return true;
    },
  );
});

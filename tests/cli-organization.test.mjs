import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { afterEach, beforeEach, test } from 'node:test';
import { promisify } from 'node:util';
import { api, seed, startRuntime } from './runtime.mjs';

const execute = promisify(execFile);
let runtime;
let fixture;

beforeEach(async () => {
  runtime = await startRuntime(8911);
  fixture = await seed(api(runtime.url));
});

afterEach(async () => {
  const activeRuntime = runtime;
  runtime = undefined;
  fixture = undefined;
  await activeRuntime?.stop();
});

async function cli(...args) {
  const result = await execute(
    process.execPath,
    [
      'dist/cli/linc.mjs',
      '--url',
      runtime.url,
      '--test-email',
      'owner@example.test',
      '--workspace',
      fixture.workspaceId,
      '--json',
      ...args,
    ],
    { env: { ...process.env, XDG_CACHE_HOME: runtime.cacheHome } },
  );
  return JSON.parse(result.stdout);
}

test('project status and issue project moves round-trip through the CLI', async () => {
  const first = (
    await cli(
      'project',
      'create',
      '--name',
      'Foundation',
      '--team',
      'DEV',
      '--status',
      'planned',
    )
  ).current;
  const second = (
    await cli('project', 'create', '--name', 'Delivery', '--team', 'DEV')
  ).current;
  const issue = (
    await cli(
      'issue',
      'create',
      '--team',
      'DEV',
      '--title',
      'Move between projects',
      '--project',
      first.name,
    )
  ).current;
  assert.equal(issue.projectId, first.id);

  const moved = await cli(
    'issue',
    'update',
    issue.identifier,
    '--project',
    second.name,
    '--expected-version',
    '1',
  );
  assert.equal(moved.current.projectId, second.id);

  assert.deepEqual(await cli('issue', 'list', '--project', first.name), []);
  const deliveryIssues = await cli('issue', 'list', '--project', second.name);
  assert.deepEqual(
    deliveryIssues.map(({ id }) => id),
    [issue.id],
  );

  const status = await cli(
    'project',
    'update',
    first.id,
    '--status',
    'started',
    '--expected-version',
    '1',
  );
  assert.equal(status.current.status, 'started');
  assert.equal(status.current.version, 2);
});

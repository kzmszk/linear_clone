import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { afterEach, beforeEach, test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

let runtime;
let fixture;
let request;

beforeEach(async () => {
  runtime = await startRuntime(8918);
  request = api(runtime.url);
  fixture = await seed(request);
});

afterEach(async () => {
  const activeRuntime = runtime;
  runtime = undefined;
  fixture = undefined;
  request = undefined;
  await activeRuntime?.stop();
});

function runBatch(lines, workspace = 'development') {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        'dist/cli/linc.mjs',
        '--url',
        runtime.url,
        '--test-email',
        'owner@example.test',
        '--workspace',
        workspace,
        'batch',
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, XDG_CACHE_HOME: runtime.cacheHome },
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
    child.stdin.end(
      `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`,
    );
  });
}

function outputLines(output) {
  return output
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function issues() {
  const response = await request(`${fixture.base}/issues`);
  assert.equal(response.status, 200);
  return response.body.items;
}

test('batch runs commands in order with fresh option state', async () => {
  const result = await runBatch([
    [
      'issue',
      'create',
      '--team',
      'DEV',
      '--title',
      'Batch first',
      '--priority',
      '4',
    ],
    [
      'issue',
      'update',
      'DEV-1',
      '--title',
      'Batch updated',
      '--expected-version',
      '1',
    ],
    ['issue', 'create', '--team', 'DEV', '--title', 'Batch second'],
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, '');
  const output = outputLines(result.stdout);
  assert.equal(output.length, 3);
  assert.equal(output[0].current.title, 'Batch first');
  assert.equal(output[1].current.title, 'Batch updated');
  assert.equal(output[2].current.priority, 0);

  const saved = await issues();
  const first = saved.find(({ identifier }) => identifier === 'DEV-1');
  const second = saved.find(({ identifier }) => identifier === 'DEV-2');
  assert.equal(first.title, 'Batch updated');
  assert.equal(first.version, 2);
  assert.equal(second.title, 'Batch second');
  assert.equal(second.priority, 0);
});

test('batch stops on conflict and does not run later writes', async () => {
  const created = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: fixture.team.id, title: 'Conflict target' },
  });
  assert.equal(created.status, 201);
  const target = created.body.current;
  const result = await runBatch([
    [
      'issue',
      'update',
      target.identifier,
      '--title',
      'Stale update',
      '--expected-version',
      '99',
    ],
    ['issue', 'create', '--team', 'DEV', '--title', 'Must not run'],
  ]);

  assert.equal(result.code, 2);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'version_conflict');
  const savedTarget = await request(`${fixture.base}/issues/${target.id}`);
  assert.equal(savedTarget.status, 200);
  assert.equal(savedTarget.body.title, 'Conflict target');
  assert.equal(savedTarget.body.version, 1);
  assert.equal(
    (await issues()).some(({ title }) => title === 'Must not run'),
    false,
  );
});

test('batch rejects invalid input before later commands', async () => {
  const result = await runBatch([
    'issue list',
    ['issue', 'create', '--team', 'DEV', '--title', 'Invalid later write'],
  ]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(
    JSON.parse(result.stderr).error.message,
    /non-empty JSON array of strings/u,
  );
  assert.equal(
    (await issues()).some(({ title }) => title === 'Invalid later write'),
    false,
  );
});

test('batch reports workspace preflight errors as JSON', async () => {
  const result = await runBatch([['issue', 'list']], 'missing-workspace');

  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  const error = JSON.parse(result.stderr).error;
  assert.equal(error.code, 'cli_error');
  assert.match(error.message, /Workspace not found/u);
});

test('batch rejects nested batch, auth, import, and help', async () => {
  for (const [line, expected] of [
    [['batch'], /nested batch/u],
    [['auth', 'login'], /auth commands/u],
    [['auth', '--url', runtime.url, 'login'], /auth commands/u],
    [['import', 'linear', 'verify', '/tmp/example'], /import commands/u],
    [['issue', 'list', '--help'], /help/u],
  ]) {
    const result = await runBatch([line]);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    assert.match(JSON.parse(result.stderr).error.message, expected);
  }
});

test('batch resolves references from fresh metadata for each line', async () => {
  const created = await request(`${fixture.base}/projects`, {
    method: 'POST',
    body: { name: 'Old batch project', teamIds: [fixture.team.id] },
  });
  assert.equal(created.status, 201);
  const project = created.body.current;
  const result = await runBatch([
    [
      'project',
      'update',
      project.id,
      '--name',
      'Renamed batch project',
      '--expected-version',
      '1',
    ],
    [
      'issue',
      'create',
      '--team',
      'DEV',
      '--title',
      'Fresh metadata issue',
      '--project',
      'Renamed batch project',
    ],
  ]);

  assert.equal(result.code, 0, result.stderr);
  const output = outputLines(result.stdout);
  assert.equal(output.length, 2);
  assert.equal(output[1].current.projectId, project.id);
  const saved = await request(`${fixture.base}/issues/${output[1].current.id}`);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.projectId, project.id);
});

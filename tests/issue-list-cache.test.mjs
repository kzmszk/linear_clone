import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

const execute = promisify(execFile);
let runtime, request, fixture, cacheHome;
beforeEach(async () => {
  runtime = await startRuntime(8922);
  request = api(runtime.url);
  fixture = await seed(request);
  cacheHome = await mkdtemp(path.join(tmpdir(), 'linc-list-cache-'));
});
afterEach(async () => {
  await runtime?.stop();
  if (cacheHome) await rm(cacheHome, { recursive: true, force: true });
});

async function createIssue(title, fields = {}) {
  const result = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: fixture.team.id, title, ...fields },
  });
  assert.equal(result.status, 201);
  return result.body.current;
}

async function cli(email = 'owner@example.test') {
  const tracePath = path.join(cacheHome, 'trace.json');
  const { stdout } = await execute(
    process.execPath,
    [
      'dist/cli/linc.mjs',
      '--url',
      runtime.url,
      '--test-email',
      email,
      '--workspace',
      'development',
      '--json',
      'issue',
      'list',
    ],
    {
      env: {
        ...process.env,
        XDG_CACHE_HOME: cacheHome,
        NODE_OPTIONS: `--import=${path.resolve('scripts/benchmark-cli-daily-fetch-trace.mjs')}`,
        LINC_BENCHMARK_TRACE_FILE: tracePath,
      },
    },
  );
  return {
    items: JSON.parse(stdout),
    trace: JSON.parse(await readFile(tracePath, 'utf8')),
  };
}

async function conditionalList(
  etag,
  email = 'owner@example.test',
  query = 'lifecycle=open',
) {
  return fetch(`${runtime.url}/api/v1${fixture.base}/issues?${query}`, {
    headers: {
      'x-test-email': email,
      ...(etag ? { 'If-None-Match': etag } : {}),
    },
  });
}

test('CLI validates cached lists and refreshes remote updates and malformed files', async () => {
  const issue = await createIssue('Before');
  const cold = await cli();
  assert.deepEqual(
    cold.items.map(({ title }) => title),
    ['Before'],
  );
  assert.deepEqual(cold.trace.responsesByStatus, { 200: 1 });
  const warm = await cli();
  assert.deepEqual(warm.items, cold.items);
  assert.deepEqual(warm.trace.responsesByStatus, { 304: 1 });

  const changed = await request(`${fixture.base}/issues/${issue.id}`, {
    method: 'PATCH',
    body: { expectedVersion: 1, title: 'After' },
  });
  assert.equal(changed.status, 200);
  const refreshed = await cli();
  assert.deepEqual(
    refreshed.items.map(({ title, version }) => [title, version]),
    [['After', 2]],
  );
  assert.deepEqual(refreshed.trace.responsesByStatus, { 200: 1 });

  const directory = path.join(cacheHome, 'linc', 'issue-lists');
  const entries = await readdir(directory);
  assert.equal(entries.length, 1);
  await writeFile(path.join(directory, entries[0]), 'invalid JSON');
  const repaired = await cli();
  assert.deepEqual(repaired.items, refreshed.items);
  assert.deepEqual(repaired.trace.responsesByStatus, { 200: 1 });
});

test('validators follow completion, reopening, deletion and restoration', async () => {
  const issue = await createIssue('Lifecycle');
  const states = (await request(`${fixture.base}/states`)).body;
  const done = states.find(({ type }) => type === 'completed');
  const first = await conditionalList();
  assert.equal(first.status, 200);
  let etag = first.headers.get('etag');
  assert.ok(etag);
  assert.deepEqual(
    (await first.json()).items.map(({ title }) => title),
    ['Lifecycle'],
  );
  const unchanged = await conditionalList(etag);
  assert.equal(unchanged.status, 304);
  assert.equal(await unchanged.text(), '');
  const differentFilter = await conditionalList(
    etag,
    'owner@example.test',
    'lifecycle=closed',
  );
  assert.equal(differentFilter.status, 200);
  assert.deepEqual((await differentFilter.json()).items, []);

  const steps = [
    ['PATCH', '', { stateId: done.id }, []],
    ['PATCH', '', { stateId: issue.stateId }, ['Lifecycle']],
    ['DELETE', '', {}, []],
    ['POST', '/restore', {}, ['Lifecycle']],
  ];
  let version = 1;
  for (const [method, suffix, fields, expected] of steps) {
    const changed = await request(
      `${fixture.base}/issues/${issue.id}${suffix}`,
      {
        method,
        body: { expectedVersion: version++, ...fields },
      },
    );
    assert.equal(changed.status, 200);
    const listed = await conditionalList(etag);
    assert.equal(listed.status, 200);
    assert.deepEqual(
      (await listed.json()).items.map(({ title }) => title),
      expected,
    );
    assert.notEqual(listed.headers.get('etag'), etag);
    etag = listed.headers.get('etag');
  }
});

test('cache validation isolates accounts and denies removed members', async () => {
  const invited = await request(`${fixture.base}/members`, {
    method: 'POST',
    body: {
      email: 'reader@example.test',
      name: 'Reader',
      role: 'member',
      teamIds: [],
    },
  });
  assert.equal(invited.status, 201);
  await api(runtime.url, 'reader@example.test')('/me');
  await createIssue('Public');
  const team = await request(`${fixture.base}/teams`, {
    method: 'POST',
    body: { key: 'SEC', name: 'Private', private: true },
  });
  assert.equal(team.status, 201);
  await createIssue('Secret', { teamId: team.body.current.id });
  const ownerList = await conditionalList();
  const etag = ownerList.headers.get('etag');
  const readerList = await conditionalList(etag, 'reader@example.test');
  assert.equal(readerList.status, 200);
  assert.deepEqual(
    (await readerList.json()).items.map(({ title }) => title),
    ['Public'],
  );
  await cli();
  const readerCold = await cli('reader@example.test');
  assert.deepEqual(
    readerCold.items.map(({ title }) => title),
    ['Public'],
  );
  assert.deepEqual(readerCold.trace.responsesByStatus, { 200: 1 });
  assert.deepEqual((await cli('reader@example.test')).trace.responsesByStatus, {
    304: 1,
  });
  const member = (await request(`${fixture.base}/members`)).body.find(
    ({ email }) => email === 'reader@example.test',
  );
  const granted = await request(`${fixture.base}/members/${member.id}`, {
    method: 'PATCH',
    body: { expectedVersion: member.version, teamIds: [team.body.current.id] },
  });
  assert.equal(granted.status, 200);
  const readerGranted = await cli('reader@example.test');
  assert.deepEqual(readerGranted.items.map(({ title }) => title).sort(), [
    'Public',
    'Secret',
  ]);
  assert.deepEqual(readerGranted.trace.responsesByStatus, { 200: 1 });
  const removed = await request(`${fixture.base}/members/${member.id}`, {
    method: 'DELETE',
    body: { expectedVersion: granted.body.current.version },
  });
  assert.equal(removed.status, 200);
  assert.equal(
    (
      await conditionalList(
        readerList.headers.get('etag'),
        'reader@example.test',
      )
    ).status,
    404,
  );
  await assert.rejects(cli('reader@example.test'), (error) => {
    assert.equal(error.code, 1);
    assert.equal(error.stdout, '');
    assert.equal(JSON.parse(error.stderr).error.code, 'not_found');
    return true;
  });
});

test('lists larger than one page stay complete without caching partial results', async () => {
  const created = await Promise.all(
    Array.from({ length: 201 }, (_, i) => createIssue(`Open ${i}`)),
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    const listed = await cli();
    assert.deepEqual(
      listed.items.map(({ id }) => id).sort(),
      created.map(({ id }) => id).sort(),
    );
    assert.deepEqual(listed.trace.responsesByStatus, { 200: 2 });
  }
});

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import { promisify } from 'node:util';
import { api, seed, startRuntime } from './runtime.mjs';

const execute = promisify(execFile);
let runtime;
let fixture;
let request;

beforeEach(async () => {
  runtime = await startRuntime(8919);
  request = api(runtime.url);
  fixture = await seed(request);
});

afterEach(async () => {
  const activeRuntime = runtime;
  runtime = undefined;
  request = undefined;
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

async function savedIssue(issueId) {
  const result = await request(`${fixture.base}/issues/${issueId}`);
  assert.equal(result.status, 200);
  return result.body;
}

async function rejectsNotFound(...args) {
  await assert.rejects(cli(...args), (error) => {
    assert.equal(error.code, 1);
    assert.equal(JSON.parse(error.stderr).error.code, 'not_found');
    return true;
  });
}

test('failed references and stale versions do not update the issue', async () => {
  const issue = (
    await cli('issue', 'create', '--team', 'DEV', '--title', 'Unchanged')
  ).current;
  await assert.rejects(
    cli(
      'issue',
      'update',
      issue.identifier,
      '--title',
      'Bad reference write',
      '--project',
      'Missing project',
    ),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(String(error.stderr), /Project not found/u);
      return true;
    },
  );
  assert.equal((await savedIssue(issue.id)).title, 'Unchanged');
  assert.equal((await savedIssue(issue.id)).version, 1);

  const project = (
    await cli('project', 'create', '--name', 'Valid project', '--team', 'DEV')
  ).current;
  await assert.rejects(
    cli(
      'issue',
      'update',
      issue.identifier,
      '--title',
      'Stale write',
      '--state',
      'In Progress',
      '--project',
      project.name,
      '--expected-version',
      '99',
    ),
    (error) => {
      assert.equal(error.code, 2);
      assert.equal(JSON.parse(error.stderr).error.code, 'version_conflict');
      return true;
    },
  );
  const saved = await savedIssue(issue.id);
  assert.equal(saved.title, 'Unchanged');
  assert.equal(saved.version, 1);
  assert.equal(saved.projectId, null);
});

test('state UUID mutations rely on Worker team validation', async () => {
  const metadata = (await request(`${fixture.base}/metadata`)).body;
  const validStates = metadata.states.filter(
    ({ teamId }) => teamId === fixture.team.id,
  );
  const initialState = validStates.find(({ type }) => type === 'backlog');
  const updatedState = validStates.find(({ type }) => type === 'started');
  assert.ok(initialState && updatedState);

  const unknownStateId = randomUUID();
  await rejectsNotFound(
    'issue',
    'create',
    '--team',
    'DEV',
    '--title',
    'Rejected state create',
    '--state',
    unknownStateId,
  );
  assert.deepEqual((await request(`${fixture.base}/issues`)).body.items, []);

  const issue = (
    await cli(
      'issue',
      'create',
      '--team',
      'DEV',
      '--title',
      'State UUID issue',
      '--state',
      initialState.id,
    )
  ).current;
  assert.equal(issue.stateId, initialState.id);
  const updated = (
    await cli(
      'issue',
      'update',
      issue.identifier,
      '--state',
      updatedState.id,
      '--expected-version',
      '1',
    )
  ).current;
  assert.equal(updated.stateId, updatedState.id);
  assert.equal(updated.version, 2);

  const otherTeam = await request(`${fixture.base}/teams`, {
    method: 'POST',
    body: { key: 'OTHER', name: 'Other team' },
  });
  assert.equal(otherTeam.status, 201);
  const refreshed = (await request(`${fixture.base}/metadata`)).body;
  const wrongTeamState = refreshed.states.find(
    ({ teamId }) => teamId === otherTeam.body.current.id,
  );
  assert.ok(wrongTeamState);

  for (const stateId of [wrongTeamState.id, unknownStateId]) {
    await rejectsNotFound(
      'issue',
      'update',
      issue.identifier,
      '--title',
      'Rejected state write',
      '--state',
      stateId,
      '--expected-version',
      '2',
    );
    const saved = await savedIssue(issue.id);
    assert.equal(saved.title, 'State UUID issue');
    assert.equal(saved.stateId, updatedState.id);
    assert.equal(saved.version, 2);
  }
});

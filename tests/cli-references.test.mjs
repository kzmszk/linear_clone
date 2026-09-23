import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

const execute = promisify(execFile);
let runtime, request, fixture;
beforeEach(async () => {
  runtime = await startRuntime(8916);
  request = api(runtime.url);
  fixture = await seed(request);
});
afterEach(async () => {
  await runtime?.stop();
});

async function cli(
  args,
  email = 'owner@example.test',
  workspace = fixture.workspaceId,
) {
  const { stdout } = await execute(
    process.execPath,
    [
      'dist/cli/linc.mjs',
      '--url',
      runtime.url,
      '--test-email',
      email,
      '--workspace',
      workspace,
      '--json',
      ...args,
    ],
    { env: { ...process.env, XDG_CACHE_HOME: runtime.cacheHome } },
  );
  return JSON.parse(stdout);
}

async function rejectsCommand(args, message, email) {
  await assert.rejects(cli(args, email), (error) => {
    assert.equal(error.code, 1);
    assert.equal(JSON.parse(error.stderr).error.message, message);
    return true;
  });
}

async function assertLifecycleLists(parent, child) {
  assert.deepEqual(
    (await cli(['issue', 'list'], 'owner@example.test', 'development')).map(
      (record) => record.id,
    ),
    [parent.id],
  );
  assert.deepEqual(
    (
      await cli(
        ['issue', 'list', '--closed'],
        'owner@example.test',
        'development',
      )
    ).map((record) => record.id),
    [child.id],
  );
  assert.deepEqual(
    (await cli(['issue', 'list', '--all'], 'owner@example.test', 'development'))
      .map((record) => record.id)
      .sort(),
    [child.id, parent.id].sort(),
  );
}

test('CLI resolves mixed names and IDs and saves an assignee user rather than membership ID', async () => {
  const project = (
    await cli(['project', 'create', '--name', 'Delivery', '--team', 'DEV'])
  ).current;
  const metadata = (await request(`${fixture.base}/metadata`)).body;
  const owner = metadata.members.find((member) => member.role === 'owner');
  const done = metadata.states.find((state) => state.type === 'completed');
  assert.notEqual(owner.id, owner.userId);
  const parent = (
    await cli(['issue', 'create', '--team', 'DEV', '--title', 'Parent'])
  ).current;
  const child = (
    await cli(
      [
        'issue',
        'create',
        '--team',
        fixture.team.id,
        '--title',
        'Assigned child',
        '--project',
        'delivery',
        '--state',
        done.name,
        '--assignee',
        owner.id,
        '--parent',
        parent.identifier,
      ],
      'owner@example.test',
      'development',
    )
  ).current;
  assert.equal(child.projectId, project.id);
  assert.equal(child.assigneeId, owner.userId);
  assert.equal(child.parentId, parent.id);
  assert.equal(child.stateId, done.id);
  await assertLifecycleLists(parent, child);
  assert.equal(
    (
      await cli(
        ['issue', 'get', child.identifier.toLowerCase()],
        'owner@example.test',
        'development',
      )
    ).id,
    child.id,
  );
  const records = await cli([
    'issue',
    'list',
    '--team',
    'DEV',
    '--project',
    project.id,
    '--state',
    done.id,
    '--assignee',
    owner.email,
  ]);
  assert.deepEqual(
    records.map((record) => record.id),
    [child.id],
  );
  const stored = await request(`${fixture.base}/issues/${child.id}`);
  assert.equal(stored.body.title, 'Assigned child');
  assert.equal(stored.body.assigneeId, owner.userId);
  const cleared = (
    await cli(['issue', 'update', child.identifier, '--clear-parent'])
  ).current;
  assert.equal(cleared.parentId, null);
  assert.equal(
    (await request(`${fixture.base}/issues/${child.id}`)).body.parentId,
    null,
  );
});

test('CLI rejects conflicting lifecycle switches', async () => {
  await rejectsCommand(
    ['issue', 'list', '--all', '--closed'],
    'Use only one of --all and --closed.',
  );
});

test('CLI does not treat an unknown workspace UUID as a slug', async () => {
  const uuidSlug = crypto.randomUUID();
  const collision = await request('/workspaces', {
    method: 'POST',
    body: { slug: uuidSlug, name: 'UUID slug' },
  });
  assert.equal(collision.status, 201);
  const workspace = collision.body.current;
  const team = await request(`/workspaces/${workspace.id}/teams`, {
    method: 'POST',
    body: { key: 'UUID', name: 'UUID team' },
  });
  assert.equal(team.status, 201);

  await assert.rejects(
    cli(
      ['issue', 'create', '--team', 'UUID', '--title', 'Wrong workspace'],
      'owner@example.test',
      uuidSlug,
    ),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(JSON.parse(error.stderr).error.code, 'not_found');
      return true;
    },
  );
  const stored = await request(`/workspaces/${workspace.id}/issues`);
  assert.equal(stored.status, 200);
  assert.deepEqual(stored.body.items, []);
});

test('CLI metadata respects private teams and excludes archived projects', async () => {
  const privateTeam = await request(`${fixture.base}/teams`, {
    method: 'POST',
    body: { key: 'SEC', name: 'Secret', private: true },
  });
  assert.equal(privateTeam.status, 201);
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
  const issue = (
    await cli(['issue', 'create', '--team', 'DEV', '--title', 'Visible'])
  ).current;
  assert.deepEqual(
    (await cli(['issue', 'list'], 'reader@example.test')).map(
      (record) => record.id,
    ),
    [issue.id],
  );
  await rejectsCommand(
    [
      'issue',
      'create',
      '--team',
      privateTeam.body.current.id,
      '--title',
      'Denied',
    ],
    `Team not found in workspace: ${privateTeam.body.current.id}`,
    'reader@example.test',
  );
  const project = (
    await cli(['project', 'create', '--name', 'Old project', '--team', 'DEV'])
  ).current;
  const archived = await request(`${fixture.base}/projects/${project.id}`, {
    method: 'PATCH',
    body: { expectedVersion: 1, archivedAt: '2026-01-01T00:00:00.000Z' },
  });
  assert.equal(archived.status, 200);
  await rejectsCommand(
    ['issue', 'list', '--project', project.id],
    `Project not found in workspace: ${project.id}`,
  );
  await assert.rejects(
    cli(['issue', 'list'], 'outsider@example.test'),
    (error) => {
      assert.equal(error.code, 1);
      assert.equal(JSON.parse(error.stderr).error.code, 'not_found');
      return true;
    },
  );
  const stored = await request(`${fixture.base}/issues`);
  assert.deepEqual(
    stored.body.items.map((record) => record.title),
    ['Visible'],
  );
});

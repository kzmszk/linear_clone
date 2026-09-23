import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

let runtime, request, fixture;
beforeEach(async () => {
  runtime = await startRuntime(8908);
  request = api(runtime.url);
  fixture = await seed(request);
});
afterEach(async () => {
  await runtime?.stop();
});

async function createIssue(title, fields = {}) {
  const result = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: fixture.team.id, title, ...fields },
  });
  assert.equal(result.status, 201);
  return result.body.current;
}

async function titles(query = '', actor = request) {
  const result = await actor(`${fixture.base}/issues?${query}`);
  assert.equal(result.status, 200);
  return result.body.items.map((issue) => issue.title).sort();
}

test('combined list filters track project, state and assignee changes', async () => {
  const project = await request(`${fixture.base}/projects`, {
    method: 'POST',
    body: { name: 'Search project', teamIds: [fixture.team.id] },
  });
  assert.equal(project.status, 201);
  const metadata = (await request(`${fixture.base}/metadata`)).body;
  const owner = metadata.members.find((member) => member.role === 'owner');
  const done = metadata.states.find((state) => state.type === 'completed');
  const backlog = metadata.states.find((state) => state.type === 'backlog');
  const fields = {
    projectId: project.body.current.id,
    stateId: done.id,
    assigneeId: owner.userId,
  };
  const matching = await createIssue('検索 target', fields);
  await createIssue('検索 other project', { ...fields, projectId: null });
  await createIssue('検索 other state', { ...fields, stateId: backlog.id });
  await createIssue('検索 unassigned', { ...fields, assigneeId: null });
  await createIssue('Different text', fields);
  const filter = new URLSearchParams({
    ...fields,
    teamId: fixture.team.id,
    q: '検索',
  }).toString();
  assert.deepEqual(await titles(filter), ['検索 target']);
  assert.deepEqual(await titles(`q=${matching.identifier}`), ['検索 target']);
  assert.deepEqual(await titles('q=does-not-exist'), []);
  const moved = await request(`${fixture.base}/issues/${matching.id}`, {
    method: 'PATCH',
    body: { expectedVersion: 1, projectId: null },
  });
  assert.equal(moved.status, 200);
  assert.deepEqual(await titles(filter), []);
  const restored = await request(`${fixture.base}/issues/${matching.id}`, {
    method: 'PATCH',
    body: { expectedVersion: 2, projectId: fields.projectId },
  });
  assert.equal(restored.status, 200);
  assert.deepEqual(await titles(filter), ['検索 target']);
  const listed = await request(`${fixture.base}/issues?${filter}`);
  assert.equal(listed.body.items[0].version, 3);
});

test('lifecycle filters and timestamps follow issue state changes', async () => {
  const metadata = (await request(`${fixture.base}/metadata`)).body;
  const backlog = metadata.states.find((state) => state.type === 'backlog');
  const done = metadata.states.find((state) => state.type === 'completed');
  const canceled = await request(`${fixture.base}/states`, {
    method: 'POST',
    body: {
      teamId: fixture.team.id,
      name: 'Canceled',
      type: 'canceled',
    },
  });
  assert.equal(canceled.status, 201);
  const openIssue = await createIssue('Open issue', { stateId: backlog.id });
  const completedIssue = await createIssue('Completed issue', {
    stateId: done.id,
  });
  await createIssue('Canceled issue', { stateId: canceled.body.current.id });

  assert.deepEqual(await titles(), [
    'Canceled issue',
    'Completed issue',
    'Open issue',
  ]);
  assert.deepEqual(await titles('lifecycle=open'), ['Open issue']);
  assert.deepEqual(await titles('lifecycle=closed'), [
    'Canceled issue',
    'Completed issue',
  ]);
  assert.deepEqual(await titles('lifecycle=all'), [
    'Canceled issue',
    'Completed issue',
    'Open issue',
  ]);

  const completedAt = completedIssue.completedAt;
  assert.notEqual(completedAt, null);
  const reopened = await request(
    `${fixture.base}/issues/${completedIssue.id}`,
    {
      method: 'PATCH',
      body: { expectedVersion: completedIssue.version, stateId: backlog.id },
    },
  );
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.current.completedAt, null);
  assert.equal(reopened.body.current.canceledAt, null);
  assert.deepEqual(await titles('lifecycle=open'), [
    'Completed issue',
    'Open issue',
  ]);
  const canceledAfterReopen = await request(
    `${fixture.base}/issues/${completedIssue.id}`,
    {
      method: 'PATCH',
      body: {
        expectedVersion: reopened.body.current.version,
        stateId: canceled.body.current.id,
      },
    },
  );
  assert.equal(canceledAfterReopen.status, 200);
  assert.equal(canceledAfterReopen.body.current.completedAt, null);
  assert.notEqual(canceledAfterReopen.body.current.canceledAt, null);
  assert.deepEqual(await titles('lifecycle=closed'), [
    'Canceled issue',
    'Completed issue',
  ]);
  assert.equal(
    (
      await request(
        `/workspaces/development/issues/${openIssue.identifier.toLowerCase()}`,
      )
    ).body.id,
    openIssue.id,
  );
  assert.equal(
    (await request(`${fixture.base}/issues?lifecycle=invalid`)).status,
    400,
  );
});

test('open lifecycle filtering happens before the issue page limit', async () => {
  const metadata = (await request(`${fixture.base}/metadata`)).body;
  const backlog = metadata.states.find((state) => state.type === 'backlog');
  const done = metadata.states.find((state) => state.type === 'completed');
  const openIssues = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      createIssue(`Open ${index}`, { stateId: backlog.id }),
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 2));
  await Promise.all(
    Array.from({ length: 200 }, (_, index) =>
      createIssue(`Closed ${index}`, { stateId: done.id }),
    ),
  );

  const result = await request(`${fixture.base}/issues?lifecycle=open`);
  assert.equal(result.status, 200);
  assert.equal(result.body.cursor, null);
  assert.deepEqual(
    result.body.items.map((issue) => issue.id).sort(),
    openIssues.map((issue) => issue.id).sort(),
  );
});

test('active, archived and trash lists stay separate after deletion and restoration', async () => {
  await createIssue('Active');
  const archived = await createIssue('Archived');
  const archive = await request(`${fixture.base}/issues/${archived.id}`, {
    method: 'PATCH',
    body: { expectedVersion: 1, archivedAt: '2024-02-02T03:04:05.000Z' },
  });
  assert.equal(archive.status, 200);
  const removed = await createIssue('Deleted');
  assert.equal(
    (
      await request(`${fixture.base}/issues/${removed.id}`, {
        method: 'DELETE',
        body: { expectedVersion: 1 },
      })
    ).status,
    200,
  );
  assert.deepEqual(await titles(), ['Active']);
  assert.deepEqual(await titles('archived=true'), ['Archived']);
  assert.deepEqual(await titles('deleted=true'), ['Deleted']);
  assert.deepEqual(await titles('archived=true&deleted=true'), []);
  assert.equal(
    (
      await request(`${fixture.base}/issues/${archived.id}`, {
        method: 'DELETE',
        body: { expectedVersion: 2 },
      })
    ).status,
    200,
  );
  assert.deepEqual(await titles('archived=true&deleted=true'), ['Archived']);
  assert.equal(
    (
      await request(`${fixture.base}/issues/${removed.id}/restore`, {
        method: 'POST',
        body: { expectedVersion: 2 },
      })
    ).status,
    200,
  );
  assert.deepEqual(await titles(), ['Active', 'Deleted']);
  assert.deepEqual(await titles('deleted=true'), []);
});

test('search and direct reads hide private team issues until membership is granted', async () => {
  const invited = await request(`${fixture.base}/members`, {
    method: 'POST',
    body: {
      email: 'reader@example.test',
      role: 'member',
      name: 'Reader',
      teamIds: [],
    },
  });
  assert.equal(invited.status, 201);
  const reader = api(runtime.url, 'reader@example.test');
  assert.equal((await reader('/me')).status, 200);
  const team = await request(`${fixture.base}/teams`, {
    method: 'POST',
    body: { key: 'PRIVATE', name: 'Private', private: true },
  });
  assert.equal(team.status, 201);
  const secret = await createIssue('Needle secret', {
    teamId: team.body.current.id,
  });
  await createIssue('Needle public');
  assert.deepEqual(await titles('q=Needle', reader), ['Needle public']);
  const denied = await reader(`${fixture.base}/issues/${secret.id}`);
  assert.equal(denied.status, 404);
  assert.equal(denied.body.error.code, 'not_found');
  const deniedAlias = await reader(
    `/workspaces/development/issues/${secret.identifier.toLowerCase()}`,
  );
  assert.equal(deniedAlias.status, 404);
  assert.equal(deniedAlias.body.error.code, 'not_found');
  const member = (await request(`${fixture.base}/members`)).body.find(
    (item) => item.email === 'reader@example.test',
  );
  const granted = await request(`${fixture.base}/members/${member.id}`, {
    method: 'PATCH',
    body: { expectedVersion: member.version, teamIds: [team.body.current.id] },
  });
  assert.equal(granted.status, 200);
  assert.deepEqual(await titles('q=Needle', reader), [
    'Needle public',
    'Needle secret',
  ]);
  assert.equal(
    (await reader(`${fixture.base}/issues/${secret.id}`)).body.title,
    'Needle secret',
  );
  assert.equal(
    (
      await reader(
        `/workspaces/development/issues/${secret.identifier.toLowerCase()}`,
      )
    ).body.title,
    'Needle secret',
  );
});

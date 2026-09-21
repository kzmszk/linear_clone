import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

let runtime, request, fixture;
before(async () => {
  runtime = await startRuntime();
  request = api(runtime.url);
  fixture = await seed(request);
});
after(async () => {
  await runtime?.stop();
});

test('issue lifecycle preserves Markdown, versions, replay and restore', async () => {
  const operationId = crypto.randomUUID();
  const body = {
    teamId: fixture.team.id,
    title: '検索を実装する',
    description: '## 要件\n- [ ] 日本語\n\n```ts\nconst x = 1;\n```',
    priority: 2,
  };
  const created = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body,
    operationId,
  });
  assert.ok(created.status < 300, JSON.stringify(created));
  const issue = created.body.current;
  assert.equal(issue.identifier, 'DEV-1');
  assert.equal(issue.version, 1);
  assert.equal(issue.description, body.description);
  const replay = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body,
    operationId,
  });
  assert.equal(replay.body.kind, 'replayed');
  assert.deepEqual(replay.body.receipt, created.body.receipt);
  const edited = await request(`${fixture.base}/issues/${issue.id}`, {
    method: 'PATCH',
    body: { title: '検索完了', expectedVersion: 1 },
  });
  assert.equal(edited.body.current.title, '検索完了');
  assert.equal(edited.body.current.version, 2);
  const conflict = await request(`${fixture.base}/issues/${issue.id}`, {
    method: 'PATCH',
    body: { title: '古い編集', expectedVersion: 1 },
  });
  assert.equal(conflict.status, 409);
  const removed = await request(`${fixture.base}/issues/${issue.id}`, {
    method: 'DELETE',
    body: { expectedVersion: 2 },
  });
  assert.equal(removed.body.current.version, 3);
  const list = await request(`${fixture.base}/issues`);
  assert.equal(list.body.items.length, 0);
  const restored = await request(`${fixture.base}/issues/${issue.id}/restore`, {
    method: 'POST',
    body: { expectedVersion: 3 },
  });
  assert.equal(restored.body.current.deletedAt, null);
  assert.equal(restored.body.current.title, '検索完了');
});

test('uninvited principals cannot access workspace data or bootstrap', async () => {
  const outsider = api(runtime.url, 'outsider@example.test');
  const me = await outsider('/me');
  assert.deepEqual(me.body.workspaces, []);
  assert.ok(
    [403, 404].includes((await outsider(`${fixture.base}/issues`)).status),
  );
  assert.ok(
    (
      await outsider('/bootstrap', {
        method: 'POST',
        body: { slug: 'stolen', name: 'Stolen' },
      })
    ).status >= 400,
  );
});

test('invalid input is rejected without consuming issue numbers', async () => {
  const rejected = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: fixture.team.id, title: '' },
  });
  assert.equal(rejected.status, 400);
  const created = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: fixture.team.id, title: 'Second issue' },
  });
  assert.equal(created.body.current.identifier, 'DEV-2');
});

test('private R2 files require issue access and preserve uploaded bytes', async () => {
  const created = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: fixture.team.id, title: 'Attachment owner' },
  });
  const path = `${fixture.base}/issues/${created.body.current.id}/files`;
  const contents = new TextEncoder().encode('private attachment\n');
  const uploaded = await fetch(`${runtime.url}/api/v1${path}`, {
    method: 'POST',
    headers: {
      'x-test-email': 'owner@example.test',
      'Content-Type': 'text/plain',
    },
    body: contents,
  });
  assert.equal(uploaded.status, 201);
  const metadata = await uploaded.json();
  const downloaded = await fetch(`${runtime.url}${metadata.url}`, {
    headers: { 'x-test-email': 'owner@example.test' },
  });
  assert.equal(await downloaded.text(), 'private attachment\n');
  assert.equal(downloaded.headers.get('content-disposition'), 'attachment');
  const denied = await fetch(`${runtime.url}${metadata.url}`, {
    headers: { 'x-test-email': 'outsider@example.test' },
  });
  assert.ok(denied.status === 403 || denied.status === 404);
});

test('invited members see public issues but cannot read private team issues', async () => {
  const invited = await request(`${fixture.base}/members`, {
    method: 'POST',
    body: {
      email: 'teammate@example.test',
      name: 'Teammate',
      role: 'member',
      teamIds: [],
    },
  });
  assert.ok(invited.status < 300, JSON.stringify(invited));
  const teammate = api(runtime.url, 'teammate@example.test');
  const me = await teammate('/me');
  assert.equal(me.body.workspaces.length, 1);
  const team = await request(`${fixture.base}/teams`, {
    method: 'POST',
    body: { key: 'PRIVATE', name: 'Private work', private: true },
  });
  const issue = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: team.body.current.id, title: 'Private issue' },
  });
  assert.equal(
    (await teammate(`${fixture.base}/issues/${issue.body.current.id}`)).status,
    404,
  );
  const visible = await teammate(`${fixture.base}/issues`);
  assert.ok(
    visible.body.items.every((record) => record.title !== 'Private issue'),
  );
  const members = await request(`${fixture.base}/members`);
  const member = members.body.find(
    (record) => record.email === 'teammate@example.test',
  );
  assert.ok(member.userId);
  const removed = await request(`${fixture.base}/members/${member.id}`, {
    method: 'DELETE',
    body: { expectedVersion: member.version },
  });
  assert.ok(removed.status < 300, JSON.stringify(removed));
  assert.equal((await teammate(`${fixture.base}/issues`)).status, 404);
});

test('cross-workspace references and removing the last owner are rejected', async () => {
  const other = await request('/workspaces', {
    method: 'POST',
    body: { slug: 'other', name: 'Other' },
  });
  const team = await request(`/workspaces/${other.body.current.id}/teams`, {
    method: 'POST',
    body: { key: 'OTHER', name: 'Other team' },
  });
  const rejected = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: team.body.current.id, title: 'Wrong workspace' },
  });
  assert.ok(rejected.status >= 400, JSON.stringify(rejected));
  const members = await request(`${fixture.base}/members`);
  const owner = members.body.find(
    (record) => record.email === 'owner@example.test',
  );
  const removed = await request(`${fixture.base}/members/${owner.id}`, {
    method: 'DELETE',
    body: { expectedVersion: owner.version },
  });
  assert.ok(removed.status >= 400, JSON.stringify(removed));
  assert.equal((await request(`${fixture.base}/issues`)).status, 200);
});

test('issue pagination returns every visible row beyond two pages', async () => {
  const createdTeam = await request(`${fixture.base}/teams`, {
    method: 'POST',
    body: { key: 'PAGE', name: 'Pagination' },
  });
  const teamId = createdTeam.body.current.id;
  const records = await Promise.all(
    Array.from({ length: 405 }, (_, index) =>
      request(`${fixture.base}/issues`, {
        method: 'POST',
        body: { teamId, title: `Page item ${index}` },
      }),
    ),
  );
  for (const record of records) assert.equal(record.status, 201);
  const ids = [];
  let cursor = null;
  let pageCount = 0;
  do {
    const query = new URLSearchParams({ teamId });
    if (cursor) query.set('cursor', cursor);
    const page = await request(`${fixture.base}/issues?${query}`);
    assert.equal(page.status, 200);
    ids.push(...page.body.items.map((item) => item.id));
    cursor = page.body.cursor;
    pageCount++;
    assert.ok(pageCount <= 3, 'pagination must terminate');
  } while (cursor);
  assert.equal(pageCount, 3);
  assert.equal(ids.length, 405);
  assert.equal(new Set(ids).size, 405);
  assert.equal(
    (await request(`${fixture.base}/issues?cursor=invalid`)).status,
    400,
  );
});

test('completion dates follow state changes and survive unrelated edits', async () => {
  const metadata = (await request(`${fixture.base}/metadata`)).body;
  const states = metadata.states.filter(
    (state) => state.teamId === fixture.team.id,
  );
  const done = states.find((state) => state.type === 'completed');
  const backlog = states.find((state) => state.type === 'backlog');
  const created = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: {
      teamId: fixture.team.id,
      title: 'Completion lifecycle',
      stateId: done.id,
    },
  });
  assert.equal(created.status, 201);
  const issue = created.body.current;
  assert.ok(
    issue.completedAt,
    'Creating an already completed issue records its completion date',
  );
  const edited = await request(`${fixture.base}/issues/${issue.id}`, {
    method: 'PATCH',
    body: { title: 'Still completed', expectedVersion: issue.version },
  });
  assert.equal(edited.body.current.completedAt, issue.completedAt);
  const reopened = await request(`${fixture.base}/issues/${issue.id}`, {
    method: 'PATCH',
    body: { stateId: backlog.id, expectedVersion: edited.body.current.version },
  });
  assert.equal(reopened.body.current.completedAt, null);
  assert.equal(reopened.body.current.canceledAt, null);
});

test('pending invitations can be edited and revoked before the first login', async () => {
  const invited = await request(`${fixture.base}/members`, {
    method: 'POST',
    body: {
      email: 'pending@example.test',
      name: 'Pending',
      role: 'member',
      teamIds: [],
    },
  });
  assert.equal(invited.status, 201);
  const id = invited.body.current.id;
  const changed = await request(`${fixture.base}/members/${id}`, {
    method: 'PATCH',
    body: { expectedVersion: 1, role: 'admin', teamIds: [fixture.team.id] },
  });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.current.version, 2);
  assert.equal(changed.body.current.role, 'admin');
  const listed = (await request(`${fixture.base}/members`)).body.find(
    (member) => member.id === id,
  );
  assert.equal(listed.version, 2);
  assert.deepEqual(listed.teamIds, [fixture.team.id]);
  const stale = await request(`${fixture.base}/members/${id}`, {
    method: 'DELETE',
    body: { expectedVersion: 1 },
  });
  assert.equal(stale.status, 409);
  const revoked = await request(`${fixture.base}/members/${id}`, {
    method: 'DELETE',
    body: { expectedVersion: 2 },
  });
  assert.equal(revoked.status, 200);
  assert.ok(
    (await request(`${fixture.base}/members`)).body.every(
      (member) => member.id !== id,
    ),
  );
  assert.deepEqual(
    (await api(runtime.url, 'pending@example.test')('/me')).body.workspaces,
    [],
  );
});

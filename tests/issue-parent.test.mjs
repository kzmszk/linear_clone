import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

let runtime, owner, fixture;

beforeEach(async () => {
  runtime = await startRuntime(8927);
  owner = api(runtime.url);
  fixture = await seed(owner);
});

afterEach(async () => {
  await runtime?.stop();
});

async function createIssue(title, fields = {}, request = owner) {
  const result = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: fixture.team.id, title, ...fields },
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.current;
}

async function setParent(issue, parentId, request = owner) {
  return request(`${fixture.base}/issues/${issue.id}`, {
    method: 'PATCH',
    body: { expectedVersion: issue.version, parentId },
  });
}

test('parent edits reject direct and indirect cycles without changing saved issues', async () => {
  const a = await createIssue('A');
  const b = await createIssue('B');
  const c = await createIssue('C');
  const bWithParent = await setParent(b, a.id);
  const cWithParent = await setParent(c, b.id);
  assert.equal(bWithParent.status, 200);
  assert.equal(cWithParent.status, 200);

  for (const parentId of [a.id, b.id, c.id]) {
    const rejected = await setParent(a, parentId);
    assert.equal(rejected.status, parentId === a.id ? 404 : 409);
    if (parentId !== a.id)
      assert.equal(rejected.body.error.code, 'parent_cycle');
  }
  const unchanged = await owner(`${fixture.base}/issues/${a.id}`);
  assert.equal(unchanged.body.parentId, null);
  assert.equal(unchanged.body.version, a.version);

  const cleared = await setParent(cWithParent.body.current, null);
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.current.parentId, null);
  const reparented = await setParent(a, c.id);
  assert.equal(reparented.status, 200);
  assert.equal(reparented.body.current.parentId, c.id);
});

test('a parent must belong to this workspace and be visible to the actor', async () => {
  const hiddenTeam = await owner(`${fixture.base}/teams`, {
    method: 'POST',
    body: { key: 'SECRET', name: 'Secret', private: true },
  });
  assert.equal(hiddenTeam.status, 201);
  const hiddenParent = await createIssue('Hidden parent', {
    teamId: hiddenTeam.body.current.id,
  });
  const invite = await owner(`${fixture.base}/members`, {
    method: 'POST',
    body: { email: 'reader@example.test', name: 'Reader', role: 'member' },
  });
  assert.equal(invite.status, 201);
  const reader = api(runtime.url, 'reader@example.test');
  assert.equal((await reader('/me')).status, 200);
  const child = await createIssue('Visible child', {}, reader);
  const denied = await setParent(child, hiddenParent.id, reader);
  assert.equal(denied.status, 404);
  assert.equal(JSON.stringify(denied.body).includes(hiddenParent.id), false);
  assert.equal(JSON.stringify(denied.body).includes(hiddenParent.title), false);
  assert.equal(
    (await reader(`${fixture.base}/issues/${hiddenParent.id}`)).status,
    404,
  );

  const otherWorkspace = await owner('/workspaces', {
    method: 'POST',
    body: { name: 'Other', slug: 'other' },
  });
  assert.equal(otherWorkspace.status, 201);
  const otherBase = `/workspaces/${otherWorkspace.body.current.id}`;
  const otherTeam = await owner(`${otherBase}/teams`, {
    method: 'POST',
    body: { key: 'OTHER', name: 'Other team' },
  });
  assert.equal(otherTeam.status, 201);
  const foreign = await owner(`${otherBase}/issues`, {
    method: 'POST',
    body: { teamId: otherTeam.body.current.id, title: 'Foreign parent' },
  });
  assert.equal(foreign.status, 201);
  const outside = await setParent(child, foreign.body.current.id);
  assert.equal(outside.status, 404);
  const stored = await owner(`${fixture.base}/issues/${child.id}`);
  assert.equal(stored.body.parentId, null);
  assert.equal(stored.body.version, child.version);

  const visibleParent = await createIssue('Visible parent');
  const attached = await setParent(child, visibleParent.id, reader);
  assert.equal(attached.status, 200);
  const cleared = await setParent(attached.body.current, null, reader);
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.current.parentId, null);
});

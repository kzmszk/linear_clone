import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

let runtime, request, fixture;

beforeEach(async () => {
  runtime = await startRuntime(8921);
  request = api(runtime.url);
  fixture = await seed(request);
});

afterEach(async () => {
  await runtime?.stop();
});

async function send(actor, spec) {
  return actor(spec.path, {
    method: spec.method,
    body: spec.body,
    operationId: spec.operationId,
  });
}

async function createAliasReceipts(reader) {
  const create = {
    path: '/workspaces/development/issues',
    method: 'POST',
    body: { team: 'SHARED', title: 'Old private issue' },
    operationId: randomUUID(),
  };
  const created = await send(reader, create);
  assert.equal(created.status, 201);
  const issuePath = `/workspaces/development/issues/${created.body.current.identifier.toLowerCase()}`;
  const patch = {
    path: issuePath,
    method: 'PATCH',
    body: { expectedVersion: 1, title: 'Old private issue updated' },
    operationId: randomUUID(),
  };
  const comment = {
    path: `${issuePath}/comments`,
    method: 'POST',
    body: { body: 'Old private comment' },
    operationId: randomUUID(),
  };
  assert.equal((await send(reader, patch)).status, 200);
  assert.equal((await send(reader, comment)).status, 201);
  return { create, patch, comment };
}

async function retryAliasReceipts(reader, receipts) {
  return Promise.all(Object.values(receipts).map((spec) => send(reader, spec)));
}

test('issue writes resolve team, state, project and identifier references', async () => {
  const project = await request(`${fixture.base}/projects`, {
    method: 'POST',
    body: { name: 'Delivery', teamIds: [fixture.team.id] },
  });
  assert.equal(project.status, 201);
  const metadata = (await request(`${fixture.base}/metadata`)).body;
  const done = metadata.states.find((state) => state.type === 'completed');
  const started = metadata.states.find((state) => state.type === 'started');

  const created = await request('/workspaces/development/issues', {
    method: 'POST',
    body: {
      team: 'dev',
      title: 'Referenced write',
      state: done.name,
      project: 'delivery',
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const issue = created.body.current;
  assert.equal(issue.teamId, fixture.team.id);
  assert.equal(issue.stateId, done.id);
  assert.equal(issue.projectId, project.body.current.id);

  const updated = await request(
    `/workspaces/development/issues/${issue.identifier.toLowerCase()}`,
    {
      method: 'PATCH',
      body: {
        expectedVersion: issue.version,
        state: started.name,
        project: null,
      },
    },
  );
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.current.stateId, started.id);
  assert.equal(updated.body.current.projectId, null);

  const comment = await request(
    `/workspaces/development/issues/${issue.identifier.toLowerCase()}/comments`,
    { method: 'POST', body: { body: 'Direct comment' } },
  );
  assert.equal(comment.status, 201, JSON.stringify(comment.body));
  assert.equal(comment.body.current.issueId, issue.id);
});

test('canonical issue writes still strip unknown fields', async () => {
  const created = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: {
      teamId: fixture.team.id,
      title: 'Canonical write',
      futureClientField: 'ignored',
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const updated = await request(
    `${fixture.base}/issues/${created.body.current.id}`,
    {
      method: 'PATCH',
      body: {
        expectedVersion: created.body.current.version,
        title: 'Canonical update',
        futureClientField: 'ignored',
      },
    },
  );
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.current.title, 'Canonical update');
});

test('issue writes reject mixed reference families and strict reference extras', async () => {
  const mixedCreate = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: {
      teamId: fixture.team.id,
      team: 'DEV',
      title: 'Mixed create',
    },
  });
  assert.equal(mixedCreate.status, 400);

  const strictReference = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { team: 'DEV', title: 'Strict create', futureClientField: true },
  });
  assert.equal(strictReference.status, 400);

  const created = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: fixture.team.id, title: 'Patch target' },
  });
  assert.equal(created.status, 201);
  const metadata = (await request(`${fixture.base}/metadata`)).body;
  const started = metadata.states.find((state) => state.type === 'started');
  const mixedPatch = await request(
    `${fixture.base}/issues/${created.body.current.id}`,
    {
      method: 'PATCH',
      body: {
        expectedVersion: created.body.current.version,
        stateId: started.id,
        state: started.name,
      },
    },
  );
  assert.equal(mixedPatch.status, 400);
  const stored = await request(
    `${fixture.base}/issues/${created.body.current.id}`,
  );
  assert.equal(stored.body.version, created.body.current.version);
  assert.notEqual(stored.body.stateId, started.id);
});

test('reference replays authorize the original issue and comment after alias reuse', async () => {
  const oldTeam = await request(`${fixture.base}/teams`, {
    method: 'POST',
    body: { key: 'SHARED', name: 'Old private team', private: true },
  });
  assert.equal(oldTeam.status, 201);
  const invitation = await request(`${fixture.base}/members`, {
    method: 'POST',
    body: {
      email: 'reader@example.test',
      name: 'Reader',
      role: 'member',
      teamIds: [oldTeam.body.current.id],
    },
  });
  assert.equal(invitation.status, 201);
  const reader = api(runtime.url, 'reader@example.test');
  assert.equal((await reader('/me')).status, 200);

  const receipts = await createAliasReceipts(reader);
  for (const replay of await retryAliasReceipts(reader, receipts))
    assert.equal(replay.body.kind, 'replayed');

  const renamed = await request(
    `${fixture.base}/teams/${oldTeam.body.current.id}`,
    {
      method: 'PATCH',
      body: { expectedVersion: 1, key: 'OLD' },
    },
  );
  assert.equal(renamed.status, 200);
  const newTeam = await request(`${fixture.base}/teams`, {
    method: 'POST',
    body: { key: 'SHARED', name: 'New public team', private: false },
  });
  assert.equal(newTeam.status, 201);
  const decoy = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: newTeam.body.current.id, title: 'Public decoy' },
  });
  assert.equal(decoy.status, 201);
  assert.equal(decoy.body.current.identifier, 'SHARED-1');

  const members = (await request(`${fixture.base}/members`)).body;
  const membership = members.find(
    (member) => member.email === 'reader@example.test',
  );
  const revoked = await request(`${fixture.base}/members/${membership.id}`, {
    method: 'PATCH',
    body: { expectedVersion: membership.version, teamIds: [] },
  });
  assert.equal(revoked.status, 200);

  for (const denied of await retryAliasReceipts(reader, receipts)) {
    assert.equal(denied.status, 404);
    assert.equal(denied.body.error.code, 'not_found');
  }
  const unchanged = await request(
    `${fixture.base}/issues/${decoy.body.current.id}`,
  );
  assert.equal(unchanged.body.title, 'Public decoy');
  assert.equal(unchanged.body.version, 1);
  const comments = await request(
    `${fixture.base}/issues/${decoy.body.current.id}/comments`,
  );
  assert.deepEqual(comments.body, []);
});

test('state names resolve within the referenced or current issue team', async () => {
  const otherTeam = await request(`${fixture.base}/teams`, {
    method: 'POST',
    body: { key: 'OTHER', name: 'Other team' },
  });
  assert.equal(otherTeam.status, 201);
  const states = (await request(`${fixture.base}/states`)).body;
  const devDone = states.find(
    (state) => state.teamId === fixture.team.id && state.name === 'Done',
  );
  const otherDone = states.find(
    (state) =>
      state.teamId === otherTeam.body.current.id && state.name === 'Done',
  );
  const otherIssue = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { team: 'OTHER', state: 'Done', title: 'Other done' },
  });
  assert.equal(otherIssue.status, 201);
  assert.equal(otherIssue.body.current.stateId, otherDone.id);

  const devIssue = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { team: 'DEV', title: 'Dev issue' },
  });
  const updated = await request(
    `${fixture.base}/issues/${devIssue.body.current.identifier}`,
    {
      method: 'PATCH',
      body: { expectedVersion: 1, state: 'Done' },
    },
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.body.current.stateId, devDone.id);
});

test('ambiguous project names fail before creating or updating an issue', async () => {
  for (let index = 0; index < 2; index += 1) {
    const project = await request(`${fixture.base}/projects`, {
      method: 'POST',
      body: { name: 'Duplicate', teamIds: [fixture.team.id] },
    });
    assert.equal(project.status, 201);
  }
  const rejectedCreate = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { team: 'DEV', project: 'Duplicate', title: 'Ambiguous create' },
  });
  assert.equal(rejectedCreate.status, 400);

  const issue = await request(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId: fixture.team.id, title: 'Unchanged target' },
  });
  const rejectedPatch = await request(
    `${fixture.base}/issues/${issue.body.current.identifier}`,
    {
      method: 'PATCH',
      body: { expectedVersion: 1, project: 'Duplicate' },
    },
  );
  assert.equal(rejectedPatch.status, 400);
  const stored = await request(
    `${fixture.base}/issues/${issue.body.current.id}`,
  );
  assert.equal(stored.body.version, 1);
  assert.equal(stored.body.projectId, null);
});

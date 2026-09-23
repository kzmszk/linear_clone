import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

test('state deletion archives an unused state and replays safely', async () => {
  const runtime = await startRuntime(8927);
  try {
    const request = api(runtime.url);
    const fixture = await seed(request);
    const created = await request(`${fixture.base}/states`, {
      method: 'POST',
      body: { teamId: fixture.team.id, name: 'Review' },
    });
    assert.equal(created.status, 201);
    const state = created.body.current;
    const operationId = crypto.randomUUID();
    const deletion = {
      method: 'DELETE',
      operationId,
      body: { expectedVersion: state.version },
    };

    const removed = await request(
      `${fixture.base}/states/${state.id}`,
      deletion,
    );
    assert.equal(removed.status, 200);
    assert.equal(removed.body.kind, 'committed');
    assert.equal(removed.body.current.archivedAt !== null, true);
    assert.equal(removed.body.current.version, state.version + 1);

    const listed = await request(`${fixture.base}/states`);
    assert.equal(
      listed.body.some((item) => item.id === state.id),
      false,
    );
    const cannotUseArchived = await request(`${fixture.base}/issues`, {
      method: 'POST',
      body: { teamId: fixture.team.id, stateId: state.id, title: 'Too late' },
    });
    assert.equal(cannotUseArchived.status, 404);

    const replay = await request(
      `${fixture.base}/states/${state.id}`,
      deletion,
    );
    assert.equal(replay.status, 200);
    assert.equal(replay.body.kind, 'replayed');
    assert.deepEqual(replay.body.receipt, removed.body.receipt);
    assert.deepEqual(replay.body.current, removed.body.current);

    const updated = await request(`${fixture.base}/states/${state.id}`, {
      method: 'PATCH',
      body: { expectedVersion: removed.body.current.version, name: 'Closed' },
    });
    assert.equal(updated.status, 409);
    assert.equal(updated.body.error.code, 'state_archived');

    await runtime.restart();
    const afterRestart = await request(`${fixture.base}/states`);
    assert.equal(
      afterRestart.body.some((item) => item.id === state.id),
      false,
    );
    const replayAfterRestart = await request(
      `${fixture.base}/states/${state.id}`,
      deletion,
    );
    assert.equal(replayAfterRestart.status, 200);
    assert.equal(replayAfterRestart.body.kind, 'replayed');
    assert.deepEqual(replayAfterRestart.body.receipt, removed.body.receipt);

    const member = await request(`${fixture.base}/members`, {
      method: 'POST',
      body: { email: 'reader@example.test', name: 'Reader', role: 'member' },
    });
    assert.equal(member.status, 201);
    const reader = api(runtime.url, 'reader@example.test');
    const denied = await reader(`${fixture.base}/states/${state.id}`, {
      method: 'DELETE',
      body: { expectedVersion: removed.body.current.version },
    });
    assert.equal(denied.status, 403);
  } finally {
    await runtime.stop();
  }
});

test('a deleted status can be created again with the same name', async () => {
  const runtime = await startRuntime(8930);
  try {
    const request = api(runtime.url);
    const fixture = await seed(request);
    const created = await request(`${fixture.base}/states`, {
      method: 'POST',
      body: { teamId: fixture.team.id, name: 'Review' },
    });
    const removed = await request(
      `${fixture.base}/states/${created.body.current.id}`,
      {
        method: 'DELETE',
        body: { expectedVersion: created.body.current.version },
      },
    );
    assert.equal(removed.status, 200);

    const recreated = await request(`${fixture.base}/states`, {
      method: 'POST',
      body: { teamId: fixture.team.id, name: 'Review', type: 'started' },
    });
    assert.equal(recreated.status, 201);
    assert.equal(recreated.body.current.id, created.body.current.id);
    assert.equal(recreated.body.current.archivedAt, null);
    assert.equal(recreated.body.current.type, 'started');
  } finally {
    await runtime.stop();
  }
});

test('state deletion rejects states that still have issues', async () => {
  const runtime = await startRuntime(8928);
  try {
    const request = api(runtime.url);
    const fixture = await seed(request);
    const created = await request(`${fixture.base}/states`, {
      method: 'POST',
      body: { teamId: fixture.team.id, name: 'Review' },
    });
    const state = created.body.current;
    const issue = await request(`${fixture.base}/issues`, {
      method: 'POST',
      body: { teamId: fixture.team.id, stateId: state.id, title: 'In review' },
    });
    assert.equal(issue.status, 201);

    const removed = await request(`${fixture.base}/states/${state.id}`, {
      method: 'DELETE',
      body: { expectedVersion: state.version },
    });
    assert.equal(removed.status, 409);
    assert.equal(removed.body.error.code, 'state_in_use');

    const listed = await request(`${fixture.base}/states`);
    assert.equal(
      listed.body.some((item) => item.id === state.id),
      true,
    );
    const currentIssue = await request(
      `${fixture.base}/issues/${issue.body.current.id}`,
    );
    assert.equal(currentIssue.status, 200);
    assert.equal(currentIssue.body.stateId, state.id);
  } finally {
    await runtime.stop();
  }
});

test('state deletion rejects removing the last active state', async () => {
  const runtime = await startRuntime(8929);
  try {
    const request = api(runtime.url);
    const fixture = await seed(request);
    const listed = await request(`${fixture.base}/states`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length >= 3, true);

    for (const state of listed.body.slice(0, -1)) {
      const removed = await request(`${fixture.base}/states/${state.id}`, {
        method: 'DELETE',
        body: { expectedVersion: state.version },
      });
      assert.equal(removed.status, 200);
    }

    const last = listed.body.at(-1);
    const rejected = await request(`${fixture.base}/states/${last.id}`, {
      method: 'DELETE',
      body: { expectedVersion: last.version },
    });
    assert.equal(rejected.status, 409);
    assert.equal(rejected.body.error.code, 'last_state');
  } finally {
    await runtime.stop();
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

test('used state types stay fixed while their display fields remain editable', async () => {
  const runtime = await startRuntime(8926);
  try {
    const request = api(runtime.url);
    const fixture = await seed(request);
    const states = (await request(`${fixture.base}/states`)).body;
    const started = states.find((state) => state.type === 'started');
    const done = states.find((state) => state.type === 'completed');
    const active = await request(`${fixture.base}/issues`, {
      method: 'POST',
      body: { teamId: fixture.team.id, stateId: started.id, title: 'Active' },
    });
    const finished = await request(`${fixture.base}/issues`, {
      method: 'POST',
      body: { teamId: fixture.team.id, stateId: done.id, title: 'Finished' },
    });
    assert.equal(active.status, 201);
    assert.equal(finished.status, 201);
    assert.equal(active.body.current.completedAt, null);
    assert.notEqual(finished.body.current.completedAt, null);

    for (const [state, type] of [
      [started, 'completed'],
      [done, 'started'],
    ]) {
      const denied = await request(`${fixture.base}/states/${state.id}`, {
        method: 'PATCH',
        body: { expectedVersion: state.version, type },
      });
      assert.equal(denied.status, 409);
      assert.equal(denied.body.error.code, 'state_in_use');
    }
    const renamed = await request(`${fixture.base}/states/${started.id}`, {
      method: 'PATCH',
      body: {
        expectedVersion: started.version,
        name: 'Doing',
        color: '#123456',
        position: 7,
      },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.current.name, 'Doing');
    assert.equal(renamed.body.current.type, 'started');
    assert.equal(renamed.body.current.color, '#123456');
    assert.equal(renamed.body.current.position, 7);

    const activeAfter = await request(
      `${fixture.base}/issues/${active.body.current.id}`,
    );
    const finishedAfter = await request(
      `${fixture.base}/issues/${finished.body.current.id}`,
    );
    assert.equal(activeAfter.body.completedAt, null);
    assert.equal(
      finishedAfter.body.completedAt,
      finished.body.current.completedAt,
    );
    assert.equal(activeAfter.body.version, active.body.current.version);
    assert.equal(finishedAfter.body.version, finished.body.current.version);
    const open = await request(`${fixture.base}/issues?lifecycle=open`);
    const closed = await request(`${fixture.base}/issues?lifecycle=closed`);
    assert.deepEqual(
      open.body.items.map((issue) => issue.title),
      ['Active'],
    );
    assert.deepEqual(
      closed.body.items.map((issue) => issue.title),
      ['Finished'],
    );
  } finally {
    await runtime.stop();
  }
});

test('unused states accept supported types and reject unknown types', async () => {
  const runtime = await startRuntime(8926);
  try {
    const request = api(runtime.url);
    const fixture = await seed(request);
    const invalidCreate = await request(`${fixture.base}/states`, {
      method: 'POST',
      body: { teamId: fixture.team.id, name: 'Unknown', type: 'other' },
    });
    assert.equal(invalidCreate.status, 400);
    const created = await request(`${fixture.base}/states`, {
      method: 'POST',
      body: { teamId: fixture.team.id, name: 'Review', type: 'started' },
    });
    assert.equal(created.status, 201);
    const state = created.body.current;
    const invalidPatch = await request(`${fixture.base}/states/${state.id}`, {
      method: 'PATCH',
      body: { expectedVersion: state.version, type: 'other' },
    });
    assert.equal(invalidPatch.status, 400);
    const changed = await request(`${fixture.base}/states/${state.id}`, {
      method: 'PATCH',
      body: { expectedVersion: state.version, type: 'completed' },
    });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.current.type, 'completed');
    assert.equal(changed.body.current.version, state.version + 1);
  } finally {
    await runtime.stop();
  }
});

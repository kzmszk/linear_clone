import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

const scenarios = [
  {
    name: 'project',
    resource: 'projects',
    field: 'name',
    values: ['First project edit', 'Second project edit'],
  },
  {
    name: 'member',
    resource: 'members',
    field: 'role',
    values: ['admin', 'owner'],
  },
  {
    name: 'comment',
    resource: 'comments',
    field: 'body',
    values: ['First comment edit', 'Second comment edit'],
  },
];

for (const scenario of scenarios) {
  test(`concurrent ${scenario.name} edits commit one version and replay it without another write`, async () => {
    const runtime = await startRuntime(8909);
    try {
      const request = api(runtime.url);
      const fixture = await seed(request);
      const target = await createTarget(request, fixture, scenario.resource);
      const commands = scenario.values.map((value) => ({
        method: 'PATCH',
        operationId: crypto.randomUUID(),
        body: { expectedVersion: 1, [scenario.field]: value },
      }));
      const results = await Promise.all(
        commands.map((command) => request(target.path, command)),
      );
      assert.deepEqual(
        results.map((result) => result.status).sort(),
        [200, 409],
      );
      const winnerIndex = results.findIndex((result) => result.status === 200);
      const winner = results[winnerIndex];
      const rejected = results.find((result) => result.status === 409);
      assert.equal(rejected.body.error.code, 'version_conflict');
      assert.equal(
        winner.body.current[scenario.field],
        scenario.values[winnerIndex],
      );
      assert.equal(winner.body.current.version, 2);
      const replay = await request(target.path, commands[winnerIndex]);
      assert.equal(replay.status, 200);
      assert.equal(replay.body.kind, 'replayed');
      assert.deepEqual(replay.body.receipt, winner.body.receipt);
      const records = await request(target.collection);
      assert.equal(records.status, 200);
      const saved = records.body.filter((record) => record.id === target.id);
      assert.equal(saved.length, 1);
      assert.equal(saved[0].version, 2);
      assert.equal(saved[0][scenario.field], scenario.values[winnerIndex]);
    } finally {
      await runtime.stop();
    }
  });
}

async function createTarget(request, fixture, resource) {
  let collection = `${fixture.base}/${resource}`;
  let body;
  switch (resource) {
    case 'projects':
      body = { name: 'Original project', teamIds: [fixture.team.id] };
      break;
    case 'members':
      body = {
        email: 'pending@example.test',
        name: 'Pending',
        role: 'member',
        teamIds: [],
      };
      break;
    case 'comments': {
      const issue = await request(`${fixture.base}/issues`, {
        method: 'POST',
        body: { teamId: fixture.team.id, title: 'Comment owner' },
      });
      assert.equal(issue.status, 201);
      collection = `${fixture.base}/issues/${issue.body.current.id}/comments`;
      body = { body: 'Original comment' };
      break;
    }
    default:
      throw new Error(`Unsupported fixture: ${resource}`);
  }
  const created = await request(collection, { method: 'POST', body });
  assert.equal(created.status, 201);
  const id = created.body.current.id;
  return { collection, path: `${collection}/${id}`, id };
}

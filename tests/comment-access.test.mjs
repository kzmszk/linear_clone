import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

test('comment reads need no mutation key and remain scoped to their issue and team', async () => {
  const runtime = await startRuntime(8912);
  try {
    const owner = api(runtime.url);
    const fixture = await seed(owner);
    const team = await owner(`${fixture.base}/teams`, {
      method: 'POST',
      body: { key: 'PRIVATE', name: 'Private comments', private: true },
    });
    assert.equal(team.status, 201);
    const issue = await owner(`${fixture.base}/issues`, {
      method: 'POST',
      body: { teamId: team.body.current.id, title: 'Private issue' },
    });
    assert.equal(issue.status, 201);
    const other = await owner(`${fixture.base}/issues`, {
      method: 'POST',
      body: { teamId: fixture.team.id, title: 'Other issue' },
    });
    assert.equal(other.status, 201);
    const comment = await owner(
      `${fixture.base}/issues/${issue.body.current.id}/comments`,
      {
        method: 'POST',
        body: { body: 'Private comment 日本語' },
      },
    );
    assert.equal(comment.status, 201);
    const path = `${fixture.base}/issues/${issue.body.current.id}/comments/${comment.body.current.id}`;
    const fetched = await fetch(`${runtime.url}/api/v1${path}`, {
      headers: { 'x-test-email': 'owner@example.test' },
    });
    assert.equal(fetched.status, 200);
    assert.deepEqual(await fetched.json(), comment.body.current);
    const wrongIssue = await owner(
      `${fixture.base}/issues/${other.body.current.id}/comments/${comment.body.current.id}`,
    );
    assert.equal(wrongIssue.status, 404);
    assert.equal(wrongIssue.body.error.code, 'not_found');
    const invited = await owner(`${fixture.base}/members`, {
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
    const denied = await reader(path);
    assert.equal(denied.status, 404);
    assert.equal(denied.body.error.code, 'not_found');
    assert.deepEqual((await owner(path)).body, comment.body.current);
  } finally {
    await runtime.stop();
  }
});

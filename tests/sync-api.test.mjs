import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

let runtime;
let request;
let fixture;

beforeEach(async () => {
  runtime = await startRuntime(8938);
  request = api(runtime.url);
  fixture = await seed(request);
});

afterEach(async () => {
  await runtime?.stop();
  runtime = null;
  request = null;
  fixture = null;
});

test('applies and replays an issue update and comment in one batch', async () => {
  const issueId = crypto.randomUUID();
  const updateId = crypto.randomUUID();
  const commentId = crypto.randomUUID();
  const body = {
    operations: [
      {
        kind: 'issue.create',
        operationId: issueId,
        input: issueInput(fixture.team.id, 'Batch issue'),
      },
      {
        kind: 'issue.update',
        operationId: updateId,
        issueId,
        input: { expectedVersion: 1, title: 'Batch issue updated' },
      },
      {
        kind: 'comment.create',
        operationId: commentId,
        issueId,
        input: { body: 'Batch comment', parentCommentId: null },
      },
    ],
  };

  const first = await sync(body);
  assert.equal(first.status, 200, JSON.stringify(first));
  assert.equal(first.body.failure, null);
  assert.deepEqual(
    first.body.accepted.map((receipt) => receipt.operationId),
    [issueId, updateId, commentId],
  );
  assert.deepEqual(
    first.body.accepted.map((receipt) => receipt.entityId),
    [issueId, issueId, commentId],
  );
  assert.equal(first.body.principal.email, 'owner@example.test');
  assert.equal(first.body.workspaceId, fixture.workspaceId);
  assert.equal(first.body.sequence, first.body.snapshot.sequence);
  assert.equal(first.body.snapshot.principal.email, 'owner@example.test');
  assert.equal(first.body.snapshot.workspace.id, fixture.workspaceId);
  assert.equal(first.body.snapshot.issues.length, 1);
  assert.equal(first.body.snapshot.issues[0].id, issueId);
  assert.equal(first.body.snapshot.issues[0].title, 'Batch issue updated');
  assert.equal(first.body.snapshot.issues[0].version, 2);
  assert.equal(first.body.snapshot.comments.length, 1);
  assert.equal(first.body.snapshot.comments[0].id, commentId);
  assert.equal(first.body.snapshot.comments[0].issueId, issueId);
  assert.equal(first.body.snapshot.comments[0].body, 'Batch comment');

  const replay = await sync(body);
  assert.equal(replay.status, 200, JSON.stringify(replay));
  assert.deepEqual(replay.body.accepted, first.body.accepted);
  assert.equal(replay.body.failure, null);
  assert.equal(replay.body.snapshot.issues.length, 1);
});

test('stops at the first CAS conflict and preserves the successful prefix', async () => {
  const prefixId = crypto.randomUUID();
  const conflictId = crypto.randomUUID();
  const laterId = crypto.randomUUID();
  const body = {
    operations: [
      {
        kind: 'issue.create',
        operationId: prefixId,
        input: issueInput(fixture.team.id, 'Successful prefix'),
      },
      {
        kind: 'issue.update',
        operationId: conflictId,
        issueId: prefixId,
        input: { expectedVersion: 99, title: 'Stale edit' },
      },
      {
        kind: 'issue.create',
        operationId: laterId,
        input: issueInput(fixture.team.id, 'Must not run'),
      },
    ],
  };

  const result = await sync(body);
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.deepEqual(
    result.body.accepted.map((receipt) => receipt.operationId),
    [prefixId],
  );
  assert.equal(result.body.failure.operationId, conflictId);
  assert.equal(result.body.failure.status, 409);
  assert.equal(result.body.failure.code, 'version_conflict');
  assert.equal(result.body.failure.current.id, prefixId);
  assert.deepEqual(
    result.body.snapshot.issues.map((issue) => issue.title),
    ['Successful prefix'],
  );

  const retry = await sync(body);
  assert.equal(retry.status, 200, JSON.stringify(retry));
  assert.deepEqual(
    retry.body.accepted.map((receipt) => receipt.operationId),
    [prefixId],
  );
  assert.equal(retry.body.failure.operationId, conflictId);
  assert.equal(retry.body.snapshot.issues.length, 1);
});

test('rejects a stable issue ID collision without overwriting the owner record', async () => {
  const existingId = crypto.randomUUID();
  const created = await sync({
    operations: [
      {
        kind: 'issue.create',
        operationId: existingId,
        input: issueInput(fixture.team.id, 'Original owner issue'),
      },
    ],
  });
  assert.equal(created.status, 200, JSON.stringify(created));
  const invited = await request(`${fixture.base}/members`, {
    method: 'POST',
    body: {
      email: 'collision-reader@example.test',
      name: 'Collision reader',
      role: 'member',
      teamIds: [fixture.team.id],
    },
  });
  assert.equal(invited.status, 201, JSON.stringify(invited));

  const reader = api(runtime.url, 'collision-reader@example.test');
  const collision = await reader(`${fixture.base}/sync`, {
    method: 'POST',
    body: {
      operations: [
        {
          kind: 'issue.create',
          operationId: existingId,
          input: issueInput(fixture.team.id, 'Must not overwrite'),
        },
      ],
    },
  });
  assert.equal(collision.status, 200, JSON.stringify(collision));
  assert.deepEqual(collision.body.accepted, []);
  assert.equal(collision.body.failure.operationId, existingId);
  assert.equal(collision.body.failure.status, 409);
  assert.equal(collision.body.failure.code, 'entity_id_taken');
  assert.deepEqual(
    collision.body.snapshot.issues.map((issue) => issue.title),
    ['Original owner issue'],
  );
  const stored = await request(`${fixture.base}/issues/${existingId}`);
  assert.equal(stored.status, 200);
  assert.equal(stored.body.title, 'Original owner issue');
});

test('snapshot keeps completed, archived and deleted issues with their comments', async () => {
  const metadata = await request(`${fixture.base}/metadata`);
  assert.equal(metadata.status, 200, JSON.stringify(metadata));
  const completed = metadata.body.states.find(
    (state) => state.teamId === fixture.team.id && state.type === 'completed',
  );
  assert.ok(completed);
  const issueId = crypto.randomUUID();
  const commentId = crypto.randomUUID();
  const updateId = crypto.randomUUID();
  const deleteId = crypto.randomUUID();
  const archivedAt = '2030-01-01T00:00:00.000Z';
  const result = await sync({
    operations: [
      {
        kind: 'issue.create',
        operationId: issueId,
        input: issueInput(fixture.team.id, 'Lifecycle snapshot', {
          stateId: completed.id,
        }),
      },
      {
        kind: 'comment.create',
        operationId: commentId,
        issueId,
        input: { body: 'Kept with deleted issue', parentCommentId: null },
      },
      {
        kind: 'issue.update',
        operationId: updateId,
        issueId,
        input: { expectedVersion: 1, archivedAt },
      },
      {
        kind: 'issue.delete',
        operationId: deleteId,
        issueId,
        expectedVersion: 2,
      },
    ],
  });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.body.failure, null);
  assert.deepEqual(
    result.body.accepted.map((receipt) => receipt.version),
    [1, 1, 2, 3],
  );
  const issue = result.body.snapshot.issues.find((item) => item.id === issueId);
  assert.ok(issue);
  assert.equal(issue.version, 3);
  assert.equal(issue.archivedAt, archivedAt);
  assert.ok(issue.deletedAt);
  assert.ok(issue.completedAt);
  const comment = result.body.snapshot.comments.find(
    (item) => item.id === commentId,
  );
  assert.ok(comment);
  assert.equal(comment.issueId, issueId);
  assert.equal(comment.body, 'Kept with deleted issue');
});

test('snapshot applies the same private-team visibility to issues and comments', async () => {
  const privateTeamId = await createPrivateTeamAndProject();
  const publicIssueId = crypto.randomUUID();
  const publicCommentId = crypto.randomUUID();
  const privateIssueId = crypto.randomUUID();
  const privateCommentId = crypto.randomUUID();
  const ownerSnapshot = await sync({
    operations: [
      {
        kind: 'issue.create',
        operationId: publicIssueId,
        input: issueInput(fixture.team.id, 'Public sync issue'),
      },
      {
        kind: 'comment.create',
        operationId: publicCommentId,
        issueId: publicIssueId,
        input: { body: 'Public sync comment', parentCommentId: null },
      },
      {
        kind: 'issue.create',
        operationId: privateIssueId,
        input: issueInput(privateTeamId, 'Private sync issue'),
      },
      {
        kind: 'comment.create',
        operationId: privateCommentId,
        issueId: privateIssueId,
        input: { body: 'Private sync comment', parentCommentId: null },
      },
    ],
  });
  assert.equal(ownerSnapshot.status, 200, JSON.stringify(ownerSnapshot));
  const invited = await request(`${fixture.base}/members`, {
    method: 'POST',
    body: {
      email: 'private-reader@example.test',
      name: 'Private reader',
      role: 'member',
      teamIds: [],
    },
  });
  assert.equal(invited.status, 201, JSON.stringify(invited));

  const reader = api(runtime.url, 'private-reader@example.test');
  const readerSnapshot = await reader(`${fixture.base}/sync`, {
    method: 'POST',
    body: { operations: [] },
  });
  assert.equal(readerSnapshot.status, 200, JSON.stringify(readerSnapshot));
  assert.deepEqual(
    readerSnapshot.body.snapshot.issues.map((issue) => issue.id),
    [publicIssueId],
  );
  assert.deepEqual(
    readerSnapshot.body.snapshot.comments.map((comment) => comment.id),
    [publicCommentId],
  );
  assert.ok(
    readerSnapshot.body.snapshot.metadata.teams.every(
      (team) => team.id !== privateTeamId,
    ),
  );
  const visibleProject = readerSnapshot.body.snapshot.metadata.projects.find(
    (project) => project.name === 'Mixed visibility project',
  );
  assert.ok(visibleProject);
  assert.deepEqual(visibleProject.teamIds, [fixture.team.id]);
  const visibleOwner = readerSnapshot.body.snapshot.metadata.members.find(
    (member) => member.email === 'owner@example.test',
  );
  assert.ok(visibleOwner);
  assert.deepEqual(visibleOwner.teamIds, [fixture.team.id]);
});

test('one batch snapshot includes more than two hundred issues', async () => {
  const operations = Array.from({ length: 201 }, (_, index) => ({
    kind: 'issue.create',
    operationId: crypto.randomUUID(),
    input: issueInput(fixture.team.id, `Large snapshot ${index}`),
  }));
  const result = await sync({ operations });
  assert.equal(result.status, 200, JSON.stringify(result));
  assert.equal(result.body.failure, null);
  assert.equal(result.body.accepted.length, 201);
  assert.equal(result.body.snapshot.issues.length, 201);
  assert.equal(
    new Set(result.body.snapshot.issues.map((issue) => issue.id)).size,
    201,
  );
});

function issueInput(teamId, title, overrides = {}) {
  return { teamId, title, ...overrides };
}

async function sync(body) {
  return request(`${fixture.base}/sync`, {
    method: 'POST',
    body,
  });
}

async function createPrivateTeamAndProject() {
  const privateTeam = await request(`${fixture.base}/teams`, {
    method: 'POST',
    body: { key: 'PRIVATE', name: 'Private team', private: true },
  });
  assert.equal(privateTeam.status, 201, JSON.stringify(privateTeam));
  const project = await request(`${fixture.base}/projects`, {
    method: 'POST',
    body: {
      name: 'Mixed visibility project',
      teamIds: [fixture.team.id, privateTeam.body.current.id],
    },
  });
  assert.equal(project.status, 201, JSON.stringify(project));
  return privateTeam.body.current.id;
}

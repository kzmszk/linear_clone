import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

async function createResources(request, base, teamId) {
  const [team, project, label, state] = await Promise.all([
    request(`${base}/teams`, {
      method: 'POST',
      body: { key: 'ARC', name: 'Archived team' },
    }),
    request(`${base}/projects`, {
      method: 'POST',
      body: { name: 'Archived project', teamIds: [teamId] },
    }),
    request(`${base}/labels`, {
      method: 'POST',
      body: { name: 'Archived label' },
    }),
    request(`${base}/states`, {
      method: 'POST',
      body: { teamId, name: 'Archived status' },
    }),
  ]);
  assert.deepEqual(
    [team.status, project.status, label.status, state.status],
    [201, 201, 201, 201],
  );
  return {
    team: team.body.current,
    project: project.body.current,
    label: label.body.current,
    state: state.body.current,
  };
}

async function archiveResources(request, base, resources) {
  const results = await Promise.all(
    Object.entries(resources).map(([kind, resource]) =>
      request(`${base}/${kind}s/${resource.id}`, {
        method: 'DELETE',
        body: { expectedVersion: resource.version },
      }),
    ),
  );
  assert.deepEqual(
    results.map((result) => result.status),
    [200, 200, 200, 200],
  );
  return Object.fromEntries(
    results.map((result, index) => [
      Object.keys(resources)[index],
      result.body.current,
    ]),
  );
}

async function assertActiveResourcesHidden(request, base, resources) {
  const [teams, projects, labels, states, metadata] = await Promise.all([
    request(`${base}/teams`),
    request(`${base}/projects`),
    request(`${base}/labels`),
    request(`${base}/states`),
    request(`${base}/metadata`),
  ]);
  assert.deepEqual(
    [
      [teams.body, resources.team.id],
      [projects.body, resources.project.id],
      [labels.body, resources.label.id],
      [states.body, resources.state.id],
      [metadata.body.teams, resources.team.id],
      [metadata.body.projects, resources.project.id],
      [metadata.body.labels, resources.label.id],
      [metadata.body.states, resources.state.id],
    ].map(([items, id]) => items.some((item) => item.id === id)),
    [false, false, false, false, false, false, false, false],
  );
}

async function assertArchivedResourcesListed(request, base, resources) {
  const lists = await Promise.all([
    request(`${base}/teams?includeArchived=true`),
    request(`${base}/projects?includeArchived=true`),
    request(`${base}/labels?includeArchived=true`),
    request(`${base}/states?includeArchived=true`),
  ]);
  for (const [resource, items] of [
    [resources.team, lists[0].body],
    [resources.project, lists[1].body],
    [resources.label, lists[2].body],
    [resources.state, lists[3].body],
  ]) {
    const item = items.find((candidate) => candidate.id === resource.id);
    assert.ok(item, `${resource.name} should appear in includeArchived list`);
    assert.equal(typeof item.archivedAt, 'string');
  }
}

async function restoreResources(request, base, resources) {
  const results = await Promise.all(
    Object.entries(resources).map(([kind, resource]) =>
      request(`${base}/${kind}s/${resource.id}`, {
        method: 'PATCH',
        body: { expectedVersion: resource.version, archivedAt: null },
      }),
    ),
  );
  assert.deepEqual(
    results.map((result) => result.status),
    [200, 200, 200, 200],
  );
  assert.deepEqual(
    results.map((result) => result.body.current.archivedAt),
    [null, null, null, null],
  );
}

test('archived organization resources are listable and restorable', async () => {
  const runtime = await startRuntime(8950);
  try {
    const request = api(runtime.url);
    const fixture = await seed(request);
    const resources = await createResources(
      request,
      fixture.base,
      fixture.team.id,
    );
    const archived = await archiveResources(request, fixture.base, resources);
    await assertActiveResourcesHidden(request, fixture.base, resources);
    await assertArchivedResourcesListed(request, fixture.base, resources);

    const ordinaryStateEdit = await request(
      `${fixture.base}/states/${resources.state.id}`,
      {
        method: 'PATCH',
        body: {
          expectedVersion: archived.state.version,
          name: 'Renamed',
        },
      },
    );
    assert.equal(ordinaryStateEdit.status, 409);
    assert.equal(ordinaryStateEdit.body.error.code, 'state_archived');

    await restoreResources(request, fixture.base, archived);
    const restoredMetadata = await request(`${fixture.base}/metadata`);
    assert.deepEqual(
      [
        restoredMetadata.body.teams.some(
          (item) => item.id === resources.team.id,
        ),
        restoredMetadata.body.projects.some(
          (item) => item.id === resources.project.id,
        ),
        restoredMetadata.body.labels.some(
          (item) => item.id === resources.label.id,
        ),
        restoredMetadata.body.states.some(
          (item) => item.id === resources.state.id,
        ),
      ],
      [true, true, true, true],
    );
  } finally {
    await runtime.stop();
  }
});

test('workspace archive remains visible through /me and /workspaces', async () => {
  const runtime = await startRuntime(8951);
  try {
    const request = api(runtime.url);
    await seed(request);
    const created = await request('/workspaces', {
      method: 'POST',
      body: { slug: 'archived-workspace', name: 'Archived workspace' },
    });
    assert.equal(created.status, 201);
    const archived = await request(`/workspaces/${created.body.current.id}`, {
      method: 'DELETE',
      body: { expectedVersion: created.body.current.version },
    });
    assert.equal(archived.status, 200);
    assert.equal(typeof archived.body.current.archivedAt, 'string');

    const [workspaces, me] = await Promise.all([
      request('/workspaces'),
      request('/me'),
    ]);
    assert.equal(
      workspaces.body.some(
        (item) =>
          item.id === created.body.current.id && item.archivedAt !== null,
      ),
      true,
    );
    assert.equal(
      me.body.workspaces.some(
        (item) =>
          item.id === created.body.current.id && item.archivedAt !== null,
      ),
      true,
    );
  } finally {
    await runtime.stop();
  }
});

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';

let runtime, owner, fixture;

beforeEach(async () => {
  runtime = await startRuntime(8934);
  owner = api(runtime.url);
  fixture = await seed(owner);
});

afterEach(async () => {
  await runtime?.stop();
});

async function issue(title, teamId = fixture.team.id, parentId = null) {
  const created = await owner(`${fixture.base}/issues`, {
    method: 'POST',
    body: { teamId, title, parentId },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return created.body.current;
}

test('hierarchy returns direct children independent of list filters and follows edits', async () => {
  const parent = await issue('Parent');
  const child = await issue('Child', fixture.team.id, parent.id);
  const grandchild = await issue('Grandchild', fixture.team.id, child.id);
  const hierarchy = await owner(
    `${fixture.base}/issues/${parent.id}/hierarchy`,
  );
  assert.equal(hierarchy.status, 200);
  assert.deepEqual(
    hierarchy.body.children.map((item) => item.id),
    [child.id],
  );
  assert.equal(hierarchy.body.children[0].identifier, child.identifier);
  assert.equal(
    (await owner(`${fixture.base}/issues/${child.id}/hierarchy`)).body.parent
      .id,
    parent.id,
  );
  assert.equal(
    (await owner(`${fixture.base}/issues/${child.id}/hierarchy`)).body
      .children[0].id,
    grandchild.id,
  );
  const cleared = await owner(`${fixture.base}/issues/${child.id}`, {
    method: 'PATCH',
    body: { expectedVersion: child.version, parentId: null },
  });
  assert.equal(cleared.status, 200);
  assert.deepEqual(
    (await owner(`${fixture.base}/issues/${parent.id}/hierarchy`)).body
      .children,
    [],
  );
});

test('hierarchy omits private parent and children from a workspace member', async () => {
  const hiddenTeam = await owner(`${fixture.base}/teams`, {
    method: 'POST',
    body: { key: 'SECRET', name: 'Secret', private: true },
  });
  assert.equal(hiddenTeam.status, 201);
  const publicParent = await issue('Public parent');
  const privateChild = await issue(
    'Secret child',
    hiddenTeam.body.current.id,
    publicParent.id,
  );
  const privateParent = await issue(
    'Secret parent',
    hiddenTeam.body.current.id,
  );
  const publicChild = await issue(
    'Public child',
    fixture.team.id,
    privateParent.id,
  );
  const invitation = await owner(`${fixture.base}/members`, {
    method: 'POST',
    body: { email: 'reader@example.test', name: 'Reader', role: 'member' },
  });
  assert.equal(invitation.status, 201);
  const reader = api(runtime.url, 'reader@example.test');
  assert.equal((await reader('/me')).status, 200);

  const visible = await reader(
    `${fixture.base}/issues/${publicParent.id}/hierarchy`,
  );
  assert.equal(visible.status, 200);
  assert.deepEqual(visible.body.children, []);
  assert.equal(
    JSON.stringify(visible.body).includes(privateChild.title),
    false,
  );
  const orphan = await reader(
    `${fixture.base}/issues/${publicChild.id}/hierarchy`,
  );
  assert.equal(orphan.status, 200);
  assert.equal(orphan.body.parent, null);
  assert.equal(
    JSON.stringify(orphan.body).includes(privateParent.title),
    false,
  );
  assert.equal(
    (await reader(`${fixture.base}/issues/${privateParent.id}/hierarchy`))
      .status,
    404,
  );
});

test('hierarchy includes children beyond the 200-item issue list page', async () => {
  const parent = await issue('Many children');
  for (let index = 0; index < 201; index += 1)
    await issue(`Child ${index + 1}`, fixture.team.id, parent.id);
  const hierarchy = await owner(
    `${fixture.base}/issues/${parent.id}/hierarchy`,
  );
  assert.equal(hierarchy.status, 200);
  assert.equal(hierarchy.body.children.length, 201);
  assert.equal(hierarchy.body.children[0].title, 'Child 1');
  assert.equal(hierarchy.body.children.at(-1).title, 'Child 201');
});

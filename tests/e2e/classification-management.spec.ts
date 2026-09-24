import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

let workspaceId = '';
let teamId = '';

test.beforeAll(async ({ request }) => {
  const suffix = crypto.randomUUID().slice(0, 8);
  const me = await (await request.get('/api/v1/me')).json();
  const workspace = await request.post(
    me.workspaces.length ? '/api/v1/workspaces' : '/api/v1/bootstrap',
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: {
        name: `Classification ${suffix}`,
        slug: `classification-${suffix}`,
      },
    },
  );
  expect(workspace.ok()).toBeTruthy();
  workspaceId = (await workspace.json()).current.id;
  const team = await request.post(`/api/v1/workspaces/${workspaceId}/teams`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { name: 'Classification team', key: `CL${suffix.toUpperCase()}` },
  });
  expect(team.ok()).toBeTruthy();
  teamId = (await team.json()).current.id;
});

test('creates, edits, and archives a label in settings', async ({
  page,
  request,
}) => {
  const name = `Review ${crypto.randomUUID().slice(0, 6)}`;
  const updated = `${name} ready`;
  await openSettings(page, 'Labels');
  await page.getByRole('button', { name: 'New label', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Label name').fill(name);
  await dialog.getByLabel('Label color').fill('#123456');
  await dialog.getByRole('button', { name: 'Create label' }).click();
  await expect(
    page.getByRole('main').getByText(name, { exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Label name').fill(updated);
  await dialog.getByLabel('Label color').fill('#654321');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('main').getByText(updated, { exact: true }),
  ).toBeVisible();

  await page
    .getByRole('button', { name: `Archive ${updated}`, exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Archive label' }).click();
  await expect(
    page.getByRole('main').getByText(updated, { exact: true }),
  ).toHaveCount(0);
  expect((await metadata(request)).labels).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ name: updated })]),
  );
});

test('creates, edits, and archives an unused status in settings', async ({
  page,
  request,
}) => {
  const name = `Review ${crypto.randomUUID().slice(0, 6)}`;
  const updated = `${name} ready`;
  await openSettings(page, 'Statuses');
  await page.getByRole('button', { name: 'New status', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Status name').fill(name);
  await dialog.getByLabel('Status type').selectOption('started');
  await dialog.getByLabel('Status color').fill('#2468ac');
  await dialog.getByLabel('Status position').fill('25');
  await dialog.getByRole('button', { name: 'Create status' }).click();
  await expect(
    page.getByRole('main').getByText(name, { exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Status team')).toBeDisabled();
  await dialog.getByLabel('Status name').fill(updated);
  await dialog.getByLabel('Status type').selectOption('backlog');
  await dialog.getByLabel('Status color').fill('#13579b');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByRole('main').getByText(updated, { exact: true }),
  ).toBeVisible();

  await page
    .getByRole('button', { name: `Archive ${updated}`, exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Archive status' }).click();
  await expect(
    page.getByRole('main').getByText(updated, { exact: true }),
  ).toHaveCount(0);
  expect((await metadata(request)).states).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ name: updated })]),
  );
});

test('keeps a status when an issue uses it and shows the archive error', async ({
  page,
  request,
}) => {
  const name = `In use ${crypto.randomUUID().slice(0, 6)}`;
  await openSettings(page, 'Statuses');
  await page.getByRole('button', { name: 'New status', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Status name').fill(name);
  await dialog.getByRole('button', { name: 'Create status' }).click();
  const state = (await metadata(request)).states.find(
    (item: { name: string }) => item.name === name,
  );
  expect(state).toBeDefined();
  const issue = await request.post(`/api/v1/workspaces/${workspaceId}/issues`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { teamId, stateId: state.id, title: `Uses ${name}` },
  });
  expect(issue.status()).toBe(201);

  await page
    .getByRole('button', { name: `Archive ${name}`, exact: true })
    .click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Archive status' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Move issues to another state before archiving it',
  );
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(
    page.getByRole('main').getByText(name, { exact: true }),
  ).toBeVisible();
});

test('keeps a label draft in place until a delayed save finishes', async ({
  page,
}) => {
  const name = `Pending ${crypto.randomUUID().slice(0, 6)}`;
  await openSettings(page, 'Labels');
  let releaseSave!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let saveStarted = false;
  await page.route(/\/api\/v1\/workspaces\/[^/]+\/labels$/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    saveStarted = true;
    await gate;
    await route.continue();
  });
  await page.getByRole('button', { name: 'New label' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Label name').fill(name);
  await dialog.getByRole('button', { name: 'Create label' }).click();
  await expect.poll(() => saveStarted).toBe(true);
  await expect(dialog.getByLabel('Label name')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  releaseSave();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('main').getByText(name, { exact: true }),
  ).toBeVisible();
});

async function openSettings(page: Page, section: 'Labels' | 'Statuses') {
  await page.goto(`/?workspace=${workspaceId}`);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: section, exact: true })
    .click();
  await expect(page.getByRole('heading', { name: section })).toBeVisible();
}

async function metadata(request: APIRequestContext) {
  const response = await request.get(
    `/api/v1/workspaces/${workspaceId}/metadata`,
  );
  expect(response.ok()).toBeTruthy();
  return response.json();
}

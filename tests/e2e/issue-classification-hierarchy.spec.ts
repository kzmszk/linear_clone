import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

let workspaceId: string;
let teamId: string;

test.beforeAll(async ({ request }) => {
  const me = await (await request.get('/api/v1/me')).json();
  const workspace = await request.post(
    me.workspaces.length ? '/api/v1/workspaces' : '/api/v1/bootstrap',
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: {
        name: 'Hierarchy browser',
        slug: `hierarchy-${Date.now().toString(36)}`,
      },
    },
  );
  expect(workspace.ok()).toBeTruthy();
  workspaceId = (await workspace.json()).current.id;
  const team = await request.post(`/api/v1/workspaces/${workspaceId}/teams`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { name: 'Engineering', key: 'HIER' },
  });
  expect(team.ok()).toBeTruthy();
  teamId = (await team.json()).current.id;
});

async function createIssue(request: APIRequestContext, title: string) {
  const response = await request.post(
    `/api/v1/workspaces/${workspaceId}/issues`,
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { teamId, title },
    },
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()).current as { id: string; identifier: string };
}

async function openIssue(page: Page, id: string) {
  await page.goto(`/?workspace=${workspaceId}&issue=${id}`);
  await expect(
    page.getByRole('region', { name: 'Issue hierarchy' }),
  ).toBeVisible();
}

async function pickIssue(page: Page, identifier: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Search issues' }).fill(identifier);
  await dialog.getByRole('button', { name: new RegExp(identifier) }).click();
  await expect(dialog).toHaveCount(0);
}

async function storedIssue(request: APIRequestContext, id: string) {
  return (await (
    await request.get(`/api/v1/workspaces/${workspaceId}/issues/${id}`)
  ).json()) as {
    parentId: string | null;
    labelIds: string[];
  };
}

test('sets, displays, navigates, and removes parent and child relationships', async ({
  page,
  request,
}) => {
  const parent = await createIssue(request, 'Browser parent');
  const child = await createIssue(request, 'Browser child');
  const otherParent = await createIssue(request, 'Other browser parent');

  await openIssue(page, child.id);
  await page.getByRole('button', { name: 'Set parent' }).click();
  await pickIssue(page, parent.identifier);
  await expect
    .poll(async () => (await storedIssue(request, child.id)).parentId)
    .toBe(parent.id);
  await expect(
    page.getByRole('button', { name: new RegExp(parent.identifier) }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Change parent' }).click();
  await pickIssue(page, otherParent.identifier);
  await expect
    .poll(async () => (await storedIssue(request, child.id)).parentId)
    .toBe(otherParent.id);
  await page.getByRole('button', { name: 'Change parent' }).click();
  await pickIssue(page, parent.identifier);
  await expect
    .poll(async () => (await storedIssue(request, child.id)).parentId)
    .toBe(parent.id);
  await page.reload();
  await page
    .getByRole('button', { name: new RegExp(parent.identifier) })
    .click();
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    'Browser parent',
  );
  await expect(
    page.getByRole('button', { name: `${child.identifier} Browser child` }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Add sub-issue' }).click();
  await pickIssue(page, otherParent.identifier);
  await expect
    .poll(async () => (await storedIssue(request, otherParent.id)).parentId)
    .toBe(parent.id);
  await page
    .getByRole('button', {
      name: `Remove ${otherParent.identifier} as sub-issue`,
    })
    .click();
  await expect
    .poll(async () => (await storedIssue(request, otherParent.id)).parentId)
    .toBeNull();

  await page
    .getByRole('button', { name: `${child.identifier} Browser child` })
    .click();
  await page.getByRole('button', { name: 'Remove parent' }).click();
  await expect
    .poll(async () => (await storedIssue(request, child.id)).parentId)
    .toBeNull();
  await expect(page.getByText('No parent')).toBeVisible();
});

test('assigns multiple labels and removes them from issue detail', async ({
  page,
  request,
}) => {
  const issue = await createIssue(request, 'Browser labels');
  const labelIds: string[] = [];
  for (const name of ['Backend', 'Review']) {
    const response = await request.post(
      `/api/v1/workspaces/${workspaceId}/labels`,
      {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        data: { name },
      },
    );
    expect(response.ok()).toBeTruthy();
    labelIds.push((await response.json()).current.id);
  }
  await openIssue(page, issue.id);
  for (const name of ['Backend', 'Review']) {
    await page.getByRole('button', { name: 'Add label' }).click();
    await page.getByRole('option', { name }).click();
  }
  await expect
    .poll(async () => (await storedIssue(request, issue.id)).labelIds.length)
    .toBe(2);
  await page.reload();
  await expect(page.getByText('Backend', { exact: true })).toBeVisible();
  await expect(page.getByText('Review', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Backend' }).click();
  await expect
    .poll(async () => (await storedIssue(request, issue.id)).labelIds)
    .toEqual([labelIds[1]]);
});

test('keeps the parent picker open while a parent change is saving', async ({
  page,
  request,
}) => {
  const parent = await createIssue(request, 'Delayed parent');
  const child = await createIssue(request, 'Delayed child');
  await openIssue(page, child.id);
  let releaseSave!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  let saveStarted = false;
  await page.route(
    `**/api/v1/workspaces/${workspaceId}/issues/${child.id}`,
    async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      saveStarted = true;
      await gate;
      await route.continue();
    },
  );
  try {
    await page.getByRole('button', { name: 'Set parent' }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('textbox', { name: 'Search issues' })
      .fill(parent.identifier);
    await dialog
      .getByRole('button', { name: new RegExp(parent.identifier) })
      .click();
    await expect.poll(() => saveStarted).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('textbox', { name: 'Search issues' }),
    ).toBeDisabled();
    releaseSave();
    await expect(dialog).toHaveCount(0);
    await expect
      .poll(async () => (await storedIssue(request, child.id)).parentId)
      .toBe(parent.id);
  } finally {
    releaseSave();
  }
});

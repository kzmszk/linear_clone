import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

const syncSlug = 'browser-sync';
let syncWorkspaceId = '';
let syncWorkspaceName = '';

test.beforeAll(async ({ request }) => {
  await ensureSyncWorkspace(request);
});

test('shows pushed updates and preserves a draft after a real conflict', async ({
  browser,
  request,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    await Promise.all([pageA.goto('/'), pageB.goto('/')]);
    await Promise.all([selectSyncWorkspace(pageA), selectSyncWorkspace(pageB)]);
    const title = `Cross-browser ${Date.now().toString(36)}`;
    const started = Date.now();
    await createIssue(pageA, title);
    await expect(pageB.getByText(title, { exact: true })).toBeVisible({
      timeout: 2_000,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    await pageB.getByText(title, { exact: true }).click();
    await expect(
      pageB.getByRole('textbox', { name: 'Issue title' }),
    ).toHaveValue(title);
    const remoteBody = await preserveDraftOnRealConflict(pageA, pageB);
    const issuesResponse = await request.get(
      `/api/v1/workspaces/${syncWorkspaceId}/issues?q=${encodeURIComponent(title)}`,
    );
    const issues = await issuesResponse.json();
    const current = issues.items.find(
      (item: { title: string }) => item.title === title,
    );
    expect(current.description).toBe(remoteBody);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

async function ensureSyncWorkspace(request: APIRequestContext) {
  const meResponse = await request.get('/api/v1/me');
  let me = await meResponse.json();
  let workspace = me.workspaces.find(
    (item: { slug: string }) => item.slug === syncSlug,
  );
  if (!workspace) {
    if (me.workspaces.length === 0) {
      const bootstrap = await request.post('/api/v1/bootstrap', {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        data: { name: 'Initial workspace', slug: 'initial' },
      });
      expect(bootstrap.ok()).toBeTruthy();
    }
    const created = await request.post('/api/v1/workspaces', {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { name: 'Browser sync', slug: syncSlug },
    });
    expect(created.ok()).toBeTruthy();
    me = await (await request.get('/api/v1/me')).json();
    workspace = me.workspaces.find(
      (item: { slug: string }) => item.slug === syncSlug,
    );
  }
  expect(workspace).toBeTruthy();
  syncWorkspaceId = workspace.id;
  syncWorkspaceName = workspace.name;
  const teamsResponse = await request.get(
    `/api/v1/workspaces/${syncWorkspaceId}/teams`,
  );
  const teams = await teamsResponse.json();
  let team = teams.find((item: { key: string }) => item.key === 'SYNC');
  if (!team) {
    const created = await request.post(
      `/api/v1/workspaces/${syncWorkspaceId}/teams`,
      {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        data: { name: 'Sync team', key: 'SYNC', private: false },
      },
    );
    expect(created.ok()).toBeTruthy();
    team = (await created.json()).current;
  }
}

async function selectSyncWorkspace(page: Page) {
  await page
    .getByRole('combobox', { name: 'Workspace', exact: true })
    .selectOption({ label: syncWorkspaceName });
  await expect(
    page.getByRole('main').getByText('All issues', { exact: true }),
  ).toBeVisible();
}

async function createIssue(page: Page, title: string) {
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^New issue/ })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await dialog.getByRole('button', { name: 'Team', exact: true }).click();
  await dialog.getByRole('option', { name: /Sync team/ }).click();
  await dialog
    .getByRole('button', { name: 'Create issue', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    title,
  );
}

async function preserveDraftOnRealConflict(pageA: Page, pageB: Page) {
  await pageA.getByRole('button', { name: 'Edit issue description' }).click();
  const draft = 'This draft must survive a real rejected save.';
  const editorA = pageA.getByRole('textbox', { name: 'Issue description' });
  await editorA.fill(draft);
  await pageB.getByRole('button', { name: 'Edit issue description' }).click();
  const remoteBody = 'The second browser wins this update.';
  const editorB = pageB.getByRole('textbox', { name: 'Issue description' });
  await editorB.fill(remoteBody);
  await pageB
    .getByRole('button', { name: 'Save description', exact: true })
    .click();
  await expect(pageB.getByText(remoteBody, { exact: true })).toBeVisible();
  await pageA
    .getByRole('button', { name: 'Save description', exact: true })
    .click();
  await expect(editorA).toHaveValue(draft);
  await expect(
    pageA.getByText('Issue was changed', { exact: true }),
  ).toBeVisible();
  return remoteBody;
}

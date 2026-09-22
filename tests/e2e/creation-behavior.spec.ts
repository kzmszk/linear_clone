import {
  expect,
  test,
  type APIRequestContext,
  type Route,
} from '@playwright/test';

let emptyWorkspaceId = '';

test.beforeAll(async ({ request }) => {
  await bootstrapWhenNeeded(request);
  const suffix = Date.now().toString(36);
  const response = await request.post('/api/v1/workspaces', {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: {
      name: `Issue creation ${suffix}`,
      slug: `issue-creation-${suffix}`,
    },
  });
  expect(response.ok()).toBeTruthy();
  emptyWorkspaceId = (await response.json()).current.id;
});

test('explains the team prerequisite and exposes required issue fields', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByLabel('Workspace', { exact: true })
    .selectOption(emptyWorkspaceId);
  await expect(page.getByRole('banner')).toBeVisible();

  await page
    .getByRole('banner')
    .getByRole('button', { name: /^New issue/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Create issue' });
  const title = dialog.getByRole('textbox', { name: 'Title', exact: true });
  const team = dialog.getByLabel('Team', { exact: true });
  const createIssue = dialog.getByRole('button', {
    name: 'Create issue',
    exact: true,
  });

  await expect(title).toBeFocused();
  await expect(title).toHaveAttribute('required', '');
  await expect(team).toHaveAttribute('aria-required', 'true');
  await expect(team).toBeDisabled();
  await expect(dialog.getByText('Create a team', { exact: true })).toHaveCount(
    1,
  );
  await expect(createIssue).toBeDisabled();

  await dialog
    .getByRole('button', { name: 'Create a team', exact: true })
    .click();
  await expect(
    page
      .getByRole('main')
      .getByRole('heading', { name: 'Teams', level: 1, exact: true }),
  ).toBeVisible();

  const main = page.getByRole('main');
  const teamName = `Creation team ${Date.now().toString(36)}`;
  const teamKey = `CRT${Date.now().toString(36).slice(-5).toUpperCase()}`;
  await expect(main.getByLabel('Team name')).toHaveCount(0);
  await main.getByRole('button', { name: 'New team', exact: true }).click();
  const teamDialog = main.getByRole('dialog', { name: 'Create team' });
  const addTeam = teamDialog.getByRole('button', {
    name: 'Create team',
    exact: true,
  });
  await expect(addTeam).toBeDisabled();
  await teamDialog.getByLabel('Team name').fill(teamName);
  await teamDialog.getByLabel('Team key').fill(teamKey);
  await expect(addTeam).toBeEnabled();
  await addTeam.click();
  await expect(teamDialog).toHaveCount(0);
  await expect(main.getByText(teamName, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'All issues', exact: true }).click();
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^New issue/ })
    .click();
  const readyDialog = page.getByRole('dialog', { name: 'Create issue' });
  const readyTitle = readyDialog.getByRole('textbox', {
    name: 'Title',
    exact: true,
  });
  const readyCreate = readyDialog.getByRole('button', {
    name: 'Create issue',
    exact: true,
  });
  await expect(readyDialog.getByLabel('Team', { exact: true })).toContainText(
    teamName,
  );
  await expect(readyCreate).toBeDisabled();
  await readyTitle.fill('Required fields are clear');
  await expect(readyCreate).toBeEnabled();
  await readyTitle.fill('');
  await expect(readyCreate).toBeDisabled();
  await readyTitle.fill('Required fields are clear');
  await readyCreate.click();
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    'Required fields are clear',
  );
});

test('keeps project context and draft fields after a failed create retry', async ({
  page,
  request,
}) => {
  const team = await ensureTeam(request);
  const projectName = `Context project ${Date.now().toString(36)}`;
  await createProject(request, projectName, team.id);

  await page.goto(`/?workspace=${emptyWorkspaceId}`);
  await page.getByRole('button', { name: projectName, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: projectName, level: 1, exact: true }),
  ).toBeVisible();
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^New issue/ })
    .click();

  const dialog = page.getByRole('dialog', { name: 'Create issue' });
  const title = 'Retry keeps the issue draft';
  await expect(
    dialog.getByRole('button', { name: 'Team', exact: true }),
  ).toContainText(team.name);
  const project = dialog.getByRole('button', {
    name: 'Project',
    exact: true,
  });
  await expect(project).toContainText(projectName);
  const titleField = dialog.getByRole('textbox', {
    name: 'Title',
    exact: true,
  });
  await titleField.fill(title);

  await page.route(
    `**/api/v1/workspaces/${emptyWorkspaceId}/issues`,
    failIssueCreate,
  );
  await titleField.press('Control+Enter');
  await expect(dialog.getByRole('alert')).toContainText(
    'Could not create the issue right now.',
  );
  await expect(titleField).toHaveValue(title);
  await expect(project).toContainText(projectName);

  await page.unroute(
    `**/api/v1/workspaces/${emptyWorkspaceId}/issues`,
    failIssueCreate,
  );
  await titleField.press('Control+Enter');
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    title,
  );
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    title,
  );
  await expect(
    page.getByRole('button', { name: 'Project', exact: true }),
  ).toContainText(projectName);
});

async function ensureTeam(request: APIRequestContext) {
  const response = await request.get(
    `/api/v1/workspaces/${emptyWorkspaceId}/teams`,
  );
  const teams = (await response.json()) as Array<{ id: string; name: string }>;
  if (teams[0]) return teams[0];
  const created = await request.post(
    `/api/v1/workspaces/${emptyWorkspaceId}/teams`,
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: {
        name: 'Retry team',
        key: `TRY${Date.now().toString(36).slice(-5).toUpperCase()}`,
      },
    },
  );
  expect(created.ok()).toBeTruthy();
  return (await created.json()).current as { id: string; name: string };
}

async function createProject(
  request: APIRequestContext,
  name: string,
  teamId: string,
) {
  const response = await request.post(
    `/api/v1/workspaces/${emptyWorkspaceId}/projects`,
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { name, description: null, status: 'planned', teamIds: [teamId] },
    },
  );
  expect(response.ok()).toBeTruthy();
}

async function failIssueCreate(route: Route) {
  if (route.request().method() !== 'POST') {
    await route.continue();
    return;
  }
  await route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({
      error: {
        code: 'forced_failure',
        message: 'Could not create the issue right now.',
      },
    }),
  });
}

async function bootstrapWhenNeeded(request: APIRequestContext) {
  const response = await request.get('/api/v1/me');
  const me = await response.json();
  if (me.workspaces.length > 0) return;
  const bootstrap = await request.post('/api/v1/bootstrap', {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { name: 'Initial workspace', slug: 'initial' },
  });
  expect(bootstrap.ok()).toBeTruthy();
}

import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

test.beforeAll(async ({ request }) => {
  await bootstrapWhenNeeded(request);
});

test('preserves a project edit draft after a failed request', async ({
  page,
  request,
}) => {
  const fixture = await createProjectEditFixture(request);

  await page.goto(`/?workspace=${fixture.workspaceId}`);
  await openSettings(page, 'Projects');
  const main = page.getByRole('main');
  await main
    .getByRole('button', {
      name: `Edit ${fixture.projectName}`,
      exact: true,
    })
    .click();
  const dialog = page.getByRole('dialog');
  const updatedName = `Updated ${fixture.projectName}`;
  const updatedDescription = 'Draft must remain after the failed request.';
  await dialog.getByLabel('Name', { exact: true }).fill(updatedName);
  await dialog
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill(updatedDescription);
  await dialog
    .getByRole('combobox', { name: 'Status', exact: true })
    .selectOption('started');
  await dialog
    .getByLabel('Teams', { exact: true })
    .selectOption(fixture.teamId);
  await page.route(
    `**/api/v1/workspaces/${fixture.workspaceId}/projects/${fixture.projectId}`,
    async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'forced_failure',
              message: 'Project update failed',
            },
          }),
        });
        return;
      }
      await route.continue();
    },
  );

  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Project update failed',
  );
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue(
    updatedName,
  );
  await expect(
    dialog.getByRole('textbox', { name: 'Description', exact: true }),
  ).toHaveValue(updatedDescription);
  await expect(
    dialog.getByRole('combobox', { name: 'Status', exact: true }),
  ).toHaveValue('started');
  await expect(dialog.getByLabel('Teams', { exact: true })).toHaveValues([
    fixture.teamId,
  ]);
  await page.unrouteAll();
  await dialog
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await openSettings(page, 'Projects');
  await page
    .getByRole('button', { name: `Edit ${updatedName}`, exact: true })
    .click();
  await expect(
    dialog.getByRole('textbox', { name: 'Description', exact: true }),
  ).toHaveValue(updatedDescription);
  await expect(
    dialog.getByRole('combobox', { name: 'Status', exact: true }),
  ).toHaveValue('started');
});

async function createProjectEditFixture(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const workspaceResponse = await request.post('/api/v1/workspaces', {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: {
      name: `Failed project edit ${suffix}`,
      slug: `failed-project-${suffix}`,
    },
  });
  expect(workspaceResponse.ok()).toBeTruthy();
  const workspace = (await workspaceResponse.json()).current as { id: string };
  const teamKey = `FP${suffix.slice(-8).toUpperCase()}`;
  const teamResponse = await request.post(
    `/api/v1/workspaces/${workspace.id}/teams`,
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { name: `Failed project team ${suffix}`, key: teamKey },
    },
  );
  expect(teamResponse.ok()).toBeTruthy();
  const team = (await teamResponse.json()).current as { id: string };
  const projectName = `Project draft ${suffix}`;
  const projectResponse = await request.post(
    `/api/v1/workspaces/${workspace.id}/projects`,
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: {
        name: projectName,
        description: 'Original project description',
        status: 'planned',
        teamIds: [team.id],
      },
    },
  );
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()).current as { id: string };

  return {
    workspaceId: workspace.id,
    teamId: team.id,
    projectId: project.id,
    projectName,
  };
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

async function openSettings(page: Page, section: string) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: section, exact: true })
    .click();
}

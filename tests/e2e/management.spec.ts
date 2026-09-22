import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

const workspaceSlug = 'browser-management';
let workspaceId = '';
let teamId = '';

test.beforeAll(async ({ request }) => {
  await bootstrapWhenNeeded(request);
});

test('manages workspaces, teams, projects, and members in settings', async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString(36);
  const workspaceName = `Browser workspace ${suffix}`;
  const teamName = `Quality ${suffix}`;
  const teamKey = `QA${suffix.slice(-4).toUpperCase()}`;
  const projectName = `Release ${suffix}`;
  const memberEmail = `browser-${suffix}@example.test`;
  const revokedEmail = `revoked-${suffix}@example.test`;

  await page.goto('/');
  await createWorkspace(page, workspaceName);
  await readWorkspace(request);
  await createTeam(page, teamName, teamKey);
  await readTeam(request, teamKey);
  await createProject(page, projectName);
  await inviteMember(page, memberEmail);
  await editWorkspace(page, workspaceName, `${workspaceName} updated`);
  await editTeam(page, teamName, `${teamName} updated`, true);
  await editProject(page, projectName);
  await editMember(page, memberEmail);
  await inviteMember(page, revokedEmail);
  await revokeMember(page, revokedEmail);

  const metadataResponse = await request.get(
    `/api/v1/workspaces/${workspaceId}/metadata`,
  );
  const metadata = await metadataResponse.json();
  expect(
    metadata.projects.some(
      (item: { name: string; status: string }) =>
        item.name === projectName && item.status === 'started',
    ),
  ).toBeTruthy();
  const teams = await (
    await request.get(`/api/v1/workspaces/${workspaceId}/teams`)
  ).json();
  expect(
    teams.some(
      (item: { key: string; name: string; private: boolean }) =>
        item.key === teamKey &&
        item.name === `${teamName} updated` &&
        item.private,
    ),
  ).toBeTruthy();
  expect(
    metadata.members.some(
      (item: { email: string; active: boolean }) =>
        item.email === memberEmail && !item.active,
    ),
  ).toBeTruthy();
  expect(
    metadata.members.some(
      (item: { email: string }) => item.email === revokedEmail,
    ),
  ).toBeFalsy();
});

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

async function createWorkspace(page: Page, name: string) {
  await openSettings(page, 'Workspaces');
  const main = page.getByRole('main');
  const save = main.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled();
  await main.getByLabel('Name', { exact: true }).fill(name);
  await main.getByLabel('Slug', { exact: true }).fill(workspaceSlug);
  await expect(save).toBeEnabled();
  await save.click();
  await expect(main.getByText(name, { exact: true })).toBeVisible();
}

async function readWorkspace(request: APIRequestContext) {
  const response = await request.get('/api/v1/workspaces');
  const workspaces = await response.json();
  const workspace = workspaces.find(
    (item: { slug: string }) => item.slug === workspaceSlug,
  );
  expect(workspace).toBeTruthy();
  workspaceId = workspace.id;
}

async function createTeam(page: Page, name: string, key: string) {
  await openSettings(page, 'Teams');
  const main = page.getByRole('main');
  await expect(main.getByLabel('Team name')).toHaveCount(0);
  await main.getByRole('button', { name: 'New team', exact: true }).click();
  const dialog = main.getByRole('dialog', { name: 'Create team' });
  const addTeam = dialog.getByRole('button', {
    name: 'Create team',
    exact: true,
  });
  await expect(addTeam).toBeDisabled();
  await dialog.getByLabel('Team name').fill(name);
  await dialog.getByLabel('Team key').fill(key);
  await expect(addTeam).toBeEnabled();
  await addTeam.click();
  await expect(dialog).toHaveCount(0);
  await expect(main.getByText(name, { exact: true })).toBeVisible();
}

async function readTeam(request: APIRequestContext, key: string) {
  const response = await request.get(`/api/v1/workspaces/${workspaceId}/teams`);
  const teams = await response.json();
  const team = teams.find((item: { key: string }) => item.key === key);
  expect(team).toBeTruthy();
  teamId = team.id;
}

async function createProject(page: Page, name: string) {
  await openSettings(page, 'Projects');
  const main = page.getByRole('main');
  await expect(main.getByLabel('Project name')).toHaveCount(0);
  await main.getByRole('button', { name: 'New project', exact: true }).click();
  const dialog = main.getByRole('dialog', { name: 'Create project' });
  const addProject = dialog.getByRole('button', {
    name: 'Create project',
    exact: true,
  });
  await expect(addProject).toBeDisabled();
  await dialog.getByLabel('Project name').fill(name);
  await dialog
    .getByLabel('Project description')
    .fill('Browser-managed release work.');
  await expect(addProject).toBeDisabled();
  await dialog.getByLabel('Teams').selectOption(teamId);
  await expect(addProject).toBeEnabled();
  await addProject.click();
  await expect(dialog).toHaveCount(0);
  await expect(main.getByText(name, { exact: true })).toBeVisible();
}

async function inviteMember(page: Page, email: string) {
  await openSettings(page, 'Members');
  const main = page.getByRole('main');
  await expect(main.getByLabel('Member email')).toHaveCount(0);
  await main
    .getByRole('button', { name: 'Invite member', exact: true })
    .click();
  const dialog = main.getByRole('dialog', {
    name: 'Invite to your workspace',
  });
  const invite = dialog.getByRole('button', {
    name: 'Send invites',
    exact: true,
  });
  await expect(invite).toBeDisabled();
  await dialog.getByLabel('Member email').fill(email);
  await dialog.getByLabel('Member name').fill('Browser Member');
  await dialog.getByLabel('Teams').selectOption(teamId);
  await expect(invite).toBeEnabled();
  await invite.click();
  await expect(dialog).toHaveCount(0);
  await expect(main.getByText(email, { exact: false })).toBeVisible();
}

async function editWorkspace(page: Page, oldName: string, newName: string) {
  await openSettings(page, 'Workspaces');
  const main = page.getByRole('main');
  await main
    .getByRole('button', { name: `Edit ${oldName}`, exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(newName);
  await dialog
    .getByLabel('Slug', { exact: true })
    .fill(`${workspaceSlug}-updated`);
  await dialog
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(main.getByText(newName, { exact: true })).toBeVisible();
}

async function editTeam(
  page: Page,
  oldName: string,
  newName: string,
  privateTeam = false,
) {
  await openSettings(page, 'Teams');
  const main = page.getByRole('main');
  await main
    .getByRole('button', { name: `Edit ${oldName}`, exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(newName);
  if (privateTeam) {
    await dialog.getByRole('checkbox', { name: 'Private team' }).check();
  }
  await dialog
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(main.getByText(newName, { exact: true })).toBeVisible();
}

async function editProject(page: Page, name: string) {
  await openSettings(page, 'Projects');
  const main = page.getByRole('main');
  await main.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Description')
    .fill('Updated from the browser settings flow.');
  await dialog
    .getByRole('combobox', { name: 'Status', exact: true })
    .selectOption('started');
  await dialog.getByLabel('Teams').selectOption(teamId);
  await dialog
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(main.getByText('started ·', { exact: false })).toBeVisible();
}

async function editMember(page: Page, email: string) {
  await openSettings(page, 'Members');
  const main = page.getByRole('main');
  await main
    .getByRole('button', { name: `Edit ${email}`, exact: true })
    .click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Role').selectOption('admin');
  await dialog.getByLabel('Teams').selectOption(teamId);
  await dialog
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(
    main.getByText(`${email} · admin`, { exact: false }),
  ).toBeVisible();
}

async function revokeMember(page: Page, email: string) {
  await openSettings(page, 'Members');
  const main = page.getByRole('main');
  await main
    .getByRole('button', { name: `Edit ${email}`, exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Revoke invitation', exact: true })
    .click();
  await expect(main.getByText(email, { exact: false })).toHaveCount(0);
}

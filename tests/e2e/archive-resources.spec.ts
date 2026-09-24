import { expect, test, type Page } from '@playwright/test';
import {
  createResource,
  createWorkspace,
  uniqueTeamKey,
  type ResourceRecord,
} from './archive-fixtures.ts';

test('archived teams and projects disappear from settings and issue creation', async ({
  page,
  request,
}) => {
  const workspace = await createWorkspace(request, 'archive-resources');
  const activeTeam = await createResource<ResourceRecord>(
    request,
    `/api/v1/workspaces/${workspace.id}/teams`,
    { name: 'Project owner team', key: uniqueTeamKey() },
  );
  const team = await createResource<ResourceRecord>(
    request,
    `/api/v1/workspaces/${workspace.id}/teams`,
    { name: `Archived team ${crypto.randomUUID()}`, key: uniqueTeamKey() },
  );
  const project = await createResource<ResourceRecord>(
    request,
    `/api/v1/workspaces/${workspace.id}/projects`,
    {
      name: `Archived project ${crypto.randomUUID()}`,
      teamIds: [activeTeam.id],
    },
  );

  await archiveResource(page, workspace.id, 'Teams', team.name, 'team');
  await expect(
    page.getByRole('main').getByText(team.name, { exact: true }),
  ).toHaveCount(0);
  await archiveResource(
    page,
    workspace.id,
    'Projects',
    project.name,
    'project',
  );
  await expect(
    page.getByRole('main').getByText(project.name, { exact: true }),
  ).toHaveCount(0);

  await expectProjectOption(page, project.name, activeTeam.name, false);

  await restoreResource(page, 'Teams', team.name);
  await openSettings(page, 'Teams');
  await expect(
    page.getByRole('main').getByText(team.name, { exact: true }),
  ).toBeVisible();
  await restoreResource(page, 'Projects', project.name);
  await openSettings(page, 'Projects');
  await expect(
    page.getByRole('main').getByText(project.name, { exact: true }),
  ).toBeVisible();

  await expectProjectOption(page, project.name, activeTeam.name, true);
});

test('archived labels and statuses disappear from settings and can be restored', async ({
  page,
  request,
}) => {
  const workspace = await createWorkspace(request, 'archive-classification');
  const team = await createResource<ResourceRecord>(
    request,
    `/api/v1/workspaces/${workspace.id}/teams`,
    { name: 'Classification team', key: uniqueTeamKey() },
  );
  const label = await createResource<ResourceRecord>(
    request,
    `/api/v1/workspaces/${workspace.id}/labels`,
    { name: `Archived label ${crypto.randomUUID()}` },
  );
  const status = await createResource<ResourceRecord>(
    request,
    `/api/v1/workspaces/${workspace.id}/states`,
    { teamId: team.id, name: `Archived status ${crypto.randomUUID()}` },
  );

  await archiveClassification(
    page,
    workspace.id,
    'Labels',
    label.name,
    'label',
  );
  await expect(
    page.getByRole('main').getByText(label.name, { exact: true }),
  ).toHaveCount(0);
  await archiveClassification(
    page,
    workspace.id,
    'Statuses',
    status.name,
    'status',
  );
  await expect(
    page.getByRole('main').getByText(status.name, { exact: true }),
  ).toHaveCount(0);

  await restoreResource(page, 'Labels', label.name);
  await openSettings(page, 'Labels');
  await expect(
    page.getByRole('main').getByText(label.name, { exact: true }),
  ).toBeVisible();
  await restoreResource(page, 'Statuses', status.name);
  await openSettings(page, 'Statuses');
  await expect(
    page.getByRole('main').getByText(status.name, { exact: true }),
  ).toBeVisible();
});

async function archiveResource(
  page: Page,
  workspaceId: string,
  section: 'Teams' | 'Projects',
  name: string,
  kind: 'team' | 'project',
) {
  await page.goto(`/?workspace=${workspaceId}`);
  await openSettings(page, section);
  await page
    .getByRole('main')
    .getByRole('button', { name: `Edit ${name}`, exact: true })
    .click();
  await page
    .getByRole('dialog', { name: `Edit ${kind}` })
    .getByRole('button', { name: `Archive ${kind}`, exact: true })
    .click();
  await page
    .getByRole('dialog', { name: `Archive ${kind}` })
    .getByRole('button', { name: `Archive ${kind}`, exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function archiveClassification(
  page: Page,
  workspaceId: string,
  section: 'Labels' | 'Statuses',
  name: string,
  kind: 'label' | 'status',
) {
  await page.goto(`/?workspace=${workspaceId}`);
  await openSettings(page, section);
  await page
    .getByRole('button', { name: `Archive ${name}`, exact: true })
    .click();
  await page
    .getByRole('dialog', { name: `Archive ${kind}` })
    .getByRole('button', { name: `Archive ${kind}`, exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function restoreResource(
  page: Page,
  section: 'Teams' | 'Projects' | 'Labels' | 'Statuses',
  name: string,
) {
  await openArchiveSection(page, section);
  const row = page
    .getByRole('main')
    .locator('.archive-row')
    .filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(row).toHaveCount(0);
}

async function expectProjectOption(
  page: Page,
  name: string,
  teamName: string,
  visible: boolean,
) {
  await page
    .getByRole('banner')
    .getByRole('button', { name: /New issue/ })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Create issue' });
  await dialog.getByRole('button', { name: 'Team', exact: true }).click();
  await dialog.getByRole('option').filter({ hasText: teamName }).click();
  await dialog.getByRole('button', { name: 'Project', exact: true }).click();
  const option = dialog.getByRole('option', { name, exact: true });
  if (visible) await expect(option).toBeVisible();
  else await expect(option).toHaveCount(0);
  await dialog
    .getByRole('combobox', { name: 'Search Project', exact: true })
    .press('Escape');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
}

async function openSettings(
  page: Page,
  section: 'Teams' | 'Projects' | 'Labels' | 'Statuses',
) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('button', { name: section, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: section, exact: true }),
  ).toBeVisible();
}

async function openArchiveSection(
  page: Page,
  section: 'Teams' | 'Projects' | 'Labels' | 'Statuses',
) {
  await page.getByRole('button', { name: 'Archived', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Archived resources' })
    .getByRole('button', { name: section, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: section, exact: true }),
  ).toBeVisible();
}

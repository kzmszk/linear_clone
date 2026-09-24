import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import {
  createResource,
  createWorkspace,
  uniqueTeamKey,
  type IssueRecord,
  type ResourceRecord,
  type WorkspaceRecord,
} from './archive-fixtures.ts';

test('archived issue details offer restore and return to active issues', async ({
  page,
  request,
}) => {
  const workspace = await createWorkspace(request, 'archive-issue');
  const team = await createResource<ResourceRecord>(
    request,
    `/api/v1/workspaces/${workspace.id}/teams`,
    { name: 'Archive issue team', key: uniqueTeamKey() },
  );
  const issue = await createResource<IssueRecord>(
    request,
    `/api/v1/workspaces/${workspace.id}/issues`,
    { teamId: team.id, title: `Archived issue ${crypto.randomUUID()}` },
  );

  await page.goto(`/?workspace=${workspace.id}`);
  await page.getByText(issue.title, { exact: true }).click();
  await page
    .getByRole('button', { name: 'Archive issue', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Restore archived issue', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Delete issue', exact: true }),
  ).toHaveCount(0);

  await page.goto(`/?workspace=${workspace.id}&issue=${issue.id}`);
  await expect(
    page.getByRole('button', { name: 'Restore archived issue', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close issue', exact: true }).click();
  const archivedIssue = page.getByRole('button', {
    name: `Open ${issue.identifier}: ${issue.title}`,
    exact: true,
  });
  await expect(archivedIssue).toBeVisible();
  await archivedIssue.click();
  await expect(
    page.getByRole('button', { name: 'Delete issue', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Restore archived issue', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close issue', exact: true }).click();
  await page.getByRole('button', { name: 'All issues', exact: true }).click();
  await expect(page.getByText(issue.title, { exact: true })).toBeVisible();
});

test('archived workspaces leave the picker and can be restored from Archived', async ({
  page,
  request,
}) => {
  await createWorkspace(request, 'archive-fallback');
  const workspace = await createWorkspace(request, 'archive-workspace');

  await page.goto(`/?workspace=${workspace.id}`);
  await openSettings(page, 'Workspaces');
  await page
    .getByRole('main')
    .getByRole('button', { name: `Edit ${workspace.name}`, exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Edit workspace' })
    .getByRole('button', { name: 'Archive workspace', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Archive workspace' })
    .getByRole('button', { name: 'Archive workspace', exact: true })
    .click();
  await expect(page.getByLabel('Workspace', { exact: true })).not.toHaveValue(
    workspace.id,
  );
  const meAfterArchive = await (await request.get('/api/v1/me')).json();
  const expectedFallback = meAfterArchive.workspaces.find(
    (item: WorkspaceRecord & { archivedAt: string | null }) => !item.archivedAt,
  );
  expect(expectedFallback).toBeTruthy();
  await expect(page.getByLabel('Workspace', { exact: true })).toHaveValue(
    expectedFallback.id,
  );

  await openArchiveSection(page, 'Workspaces');
  const row = archiveRow(page, workspace.name);
  await expect(row).toContainText(workspace.slug);
  await row.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(
    page
      .getByLabel('Workspace', { exact: true })
      .locator('option', { hasText: workspace.name }),
  ).toHaveCount(1);
  await page
    .getByLabel('Workspace', { exact: true })
    .selectOption(workspace.id);
  await openSettings(page, 'Workspaces');
  await expect(
    page.getByRole('main').getByText(workspace.name, { exact: true }),
  ).toBeVisible();
});

test('the Archive landing restores access when every workspace is archived', async ({
  page,
  request,
}) => {
  const workspace = await createWorkspace(request, 'archive-last-workspace');
  const me = await (await request.get('/api/v1/me')).json();
  const otherActive = me.workspaces.filter(
    (item: WorkspaceRecord & { archivedAt: string | null }) =>
      item.id !== workspace.id && !item.archivedAt,
  );
  const changedWorkspaceIds = new Set([
    workspace.id,
    ...otherActive.map((item: WorkspaceRecord) => item.id),
  ]);
  try {
    for (const item of otherActive) await archiveWorkspace(request, item);

    await page.goto(`/?workspace=${workspace.id}`);
    await openSettings(page, 'Workspaces');
    await archiveWorkspaceFromSettings(page, workspace.name);
    await expect(
      page.getByRole('heading', { name: 'Archived workspaces', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create workspace', exact: true }),
    ).toBeVisible();
    await restoreArchiveRow(page, workspace.name);
    await expect(page.getByLabel('Workspace', { exact: true })).toHaveValue(
      workspace.id,
    );
  } finally {
    const currentMe = await (await request.get('/api/v1/me')).json();
    const archivedTestWorkspaces = currentMe.workspaces.filter(
      (item: WorkspaceRecord & { archivedAt: string | null }) =>
        changedWorkspaceIds.has(item.id) && item.archivedAt,
    );
    for (const item of archivedTestWorkspaces)
      await restoreWorkspace(request, item);
  }
});

async function openSettings(
  page: Page,
  section: 'Workspaces' | 'Teams' | 'Projects' | 'Labels' | 'Statuses',
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
  section: 'Workspaces' | 'Teams' | 'Projects' | 'Labels' | 'Statuses',
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

async function archiveWorkspaceFromSettings(page: Page, name: string) {
  await page
    .getByRole('main')
    .getByRole('button', { name: `Edit ${name}`, exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Edit workspace' })
    .getByRole('button', { name: 'Archive workspace', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Archive workspace' })
    .getByRole('button', { name: 'Archive workspace', exact: true })
    .click();
}

async function archiveWorkspace(
  request: APIRequestContext,
  workspace: WorkspaceRecord,
) {
  const response = await request.delete(`/api/v1/workspaces/${workspace.id}`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { expectedVersion: workspace.version },
  });
  expect(response.ok()).toBeTruthy();
}

async function restoreWorkspace(
  request: APIRequestContext,
  workspace: WorkspaceRecord,
) {
  const response = await request.patch(`/api/v1/workspaces/${workspace.id}`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { archivedAt: null, expectedVersion: workspace.version },
  });
  expect(response.ok()).toBeTruthy();
}

function archiveRow(page: Page, name: string) {
  return page
    .getByRole('main')
    .locator('.archive-row')
    .filter({ hasText: name });
}

async function restoreArchiveRow(page: Page, name: string) {
  const row = archiveRow(page, name);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(row).toHaveCount(0);
}

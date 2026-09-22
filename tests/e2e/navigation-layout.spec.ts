import { expect, test } from '@playwright/test';

let workspaceId: string;
let issueId: string;
const longTitle =
  'A long issue title must remain readable without overlapping its identifier or neighboring properties '
    .repeat(3)
    .trim();

test.beforeAll(async ({ request }) => {
  const me = await (await request.get('/api/v1/me')).json();
  const workspace = await request.post(
    me.workspaces.length ? '/api/v1/workspaces' : '/api/v1/bootstrap',
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { name: 'Navigation checks', slug: `navigation-${Date.now()}` },
    },
  );
  expect(workspace.ok()).toBeTruthy();
  workspaceId = (await workspace.json()).current.id;
  const team = await request.post(`/api/v1/workspaces/${workspaceId}/teams`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { name: 'Navigation team', key: 'FUCHIKOMA' },
  });
  const teamId = (await team.json()).current.id;
  for (const title of ['Keyboard neighbor', longTitle]) {
    const created = await request.post(
      `/api/v1/workspaces/${workspaceId}/issues`,
      {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        data: { teamId, title },
      },
    );
    expect(created.ok()).toBeTruthy();
    issueId = (await created.json()).current.id;
  }
});

test('full detail supports browser history, direct links and reload', async ({
  page,
}) => {
  await page.goto(`/?workspace=${workspaceId}`);
  const row = page.getByRole('listitem').filter({ hasText: longTitle });
  await row.click();
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    longTitle,
  );
  await expect(
    page.getByRole('list', { name: 'Issues', exact: true }),
  ).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`issue=${issueId}`));
  const detail = await page
    .getByRole('complementary', { name: /Issue FUCHIKOMA/ })
    .boundingBox();
  expect(detail?.width).toBeGreaterThan(1100);
  await page.goBack();
  await expect(row).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    longTitle,
  );
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    longTitle,
  );
  await page.getByRole('button', { name: 'Close issue' }).click();
  await expect(row).toBeVisible();
});

test('list keyboard navigation opens an issue and returns focus', async ({
  page,
}) => {
  await page.goto(`/?workspace=${workspaceId}`);
  const rows = page.getByRole('listitem');
  await rows.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('textbox', { name: 'Issue title' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close issue' }).click();
  await expect(rows.nth(1)).toBeFocused();
});

for (const width of [1440, 880, 640]) {
  test(`long identifiers and titles do not overlap at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/?workspace=${workspaceId}`);
    const row = page.getByRole('listitem').filter({ hasText: longTitle });
    await expect(row).toBeVisible();
    const identifier = await row.locator('.issue-identifier').boundingBox();
    const title = await row.locator('.issue-title').boundingBox();
    expect(identifier).not.toBeNull();
    expect(title).not.toBeNull();
    expect((identifier?.x ?? 0) + (identifier?.width ?? 0)).toBeLessThan(
      title?.x ?? 0,
    );
    expect(title?.width).toBeGreaterThan(50);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await row.click();
    await expect(
      page.getByRole('textbox', { name: 'Issue title' }),
    ).toHaveValue(longTitle);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}

test('search shows matching issues, an empty result, and the cleared list', async ({
  page,
}) => {
  await page.goto(`/?workspace=${workspaceId}`);
  const search = page.getByRole('textbox', { name: 'Search issues' });
  await expect(search).toBeVisible();
  await page.keyboard.press('/');
  await expect(search).toBeFocused();
  await search.fill('Keyboard neighbor');
  await expect(page.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('listitem')).toContainText('Keyboard neighbor');
  await search.fill('no-matching-issue-title');
  await expect(page.getByText('All clear', { exact: true })).toBeVisible();
  await search.clear();
  await expect(page.getByRole('listitem')).toHaveCount(2);
});

test('a deleted issue can be found in Trash and restored after leaving detail', async ({
  page,
  request,
}) => {
  await page.goto(`/?workspace=${workspaceId}&issue=${issueId}`);
  await page.getByRole('button', { name: 'Delete issue', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Move to trash', exact: true })
    .click();
  await expect(
    page.getByText('This issue is in the trash.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close issue', exact: true }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: longTitle }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await page.getByRole('listitem').filter({ hasText: longTitle }).click();
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(
    page.getByText('This issue is in the trash.', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Close issue', exact: true }).click();
  await page.getByRole('button', { name: 'All issues', exact: true }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: longTitle }),
  ).toBeVisible();
  const response = await request.get(
    `/api/v1/workspaces/${workspaceId}/issues/${issueId}`,
  );
  expect((await response.json()).deletedAt).toBeNull();
});

test('an invalid workspace link is replaced without trapping browser Back', async ({
  page,
}) => {
  await page.goto(`/?workspace=${workspaceId}&issue=${issueId}`);
  await expect(
    page.getByRole('textbox', { name: 'Issue title' }),
  ).toBeVisible();
  await page.goto('/?workspace=missing-workspace');
  await expect(page).not.toHaveURL(/missing-workspace/);
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    longTitle,
  );
});

test('a missing deployed view bundle offers reload instead of a blank page', async ({
  page,
}) => {
  await page.route('**/assets/SelectedIssueView-*.js', (route) =>
    route.abort(),
  );
  await page.goto(`/?workspace=${workspaceId}`);
  await page.getByRole('listitem').filter({ hasText: longTitle }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Could not open this view',
  );
  await page.unroute('**/assets/SelectedIssueView-*.js');
  await page.getByRole('button', { name: 'Reload app', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    longTitle,
  );
});

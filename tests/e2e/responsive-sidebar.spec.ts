import { expect, test } from '@playwright/test';

let workspaceId = '';
let teamName = '';

test.beforeAll(async ({ request }) => {
  const suffix = Date.now().toString(36);
  const me = await (await request.get('/api/v1/me')).json();
  const workspace = await request.post(
    me.workspaces.length ? '/api/v1/workspaces' : '/api/v1/bootstrap',
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: {
        name: `Responsive navigation ${suffix}`,
        slug: `responsive-navigation-${suffix}`,
      },
    },
  );
  expect(workspace.ok()).toBeTruthy();
  workspaceId = (await workspace.json()).current.id;
  teamName = `Drawer team ${suffix}`;
  const team = await request.post(`/api/v1/workspaces/${workspaceId}/teams`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { name: teamName, key: `DRAW${suffix.slice(-3).toUpperCase()}` },
  });
  expect(team.ok()).toBeTruthy();
});

test('opens and dismisses the navigation drawer at 880px', async ({ page }) => {
  await page.setViewportSize({ width: 880, height: 900 });
  await page.goto(`/?workspace=${workspaceId}`);

  const drawer = page.locator('.sidebar-drawer');
  const openButton = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
  });
  await expect(openButton).toBeVisible();
  await expect(drawer).toBeHidden();

  await openButton.click();
  await expect(drawer).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Dismiss navigation', exact: true }),
  ).toBeVisible();

  await page
    .getByRole('button', { name: 'Dismiss navigation', exact: true })
    .click();
  await expect(drawer).toBeHidden();
  await openButton.click();
  await page
    .getByRole('button', { name: 'Close navigation', exact: true })
    .click();
  await expect(drawer).toBeHidden();
  await openButton.click();
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(openButton).toBeFocused();
});

test('closes the drawer after selecting a team', async ({ page }) => {
  await page.setViewportSize({ width: 880, height: 900 });
  await page.goto(`/?workspace=${workspaceId}`);

  const drawer = page.locator('.sidebar-drawer');
  await page
    .getByRole('button', { name: 'Open navigation', exact: true })
    .click();
  await drawer.getByRole('button', { name: new RegExp(teamName) }).click();

  await expect(drawer).toBeHidden();
  await expect(page.locator('.topbar-breadcrumb strong')).toHaveText(teamName);
});

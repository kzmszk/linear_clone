import { expect, test } from '@playwright/test';

let workspaceId: string;
let teamId: string;

test.beforeAll(async ({ request }) => {
  const me = await (await request.get('/api/v1/me')).json();
  const suffix = Date.now().toString(36);
  const workspace = await request.post(
    me.workspaces.length ? '/api/v1/workspaces' : '/api/v1/bootstrap',
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: {
        name: 'Product development',
        slug: `issues-${suffix}`,
      },
    },
  );
  expect(workspace.ok()).toBeTruthy();
  workspaceId = (await workspace.json()).current.id;
  const team = await request.post(`/api/v1/workspaces/${workspaceId}/teams`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { name: 'Engineering', key: 'ENG' },
  });
  expect(team.ok()).toBeTruthy();
  teamId = (await team.json()).current.id;
});

test('create, edit Markdown, comment, attach and delete through the browser', async ({
  page,
  request,
}) => {
  await page.goto(`/?workspace=${workspaceId}`);
  await page
    .getByRole('banner')
    .getByRole('button', { name: /^New issue/ })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: 'Title', exact: true })
    .fill('Ship the first release');
  await dialog
    .getByRole('textbox', { name: 'Description' })
    .fill('## Plan\n\nKeep **all content** intact.');
  await dialog
    .getByRole('button', { name: 'Create issue', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    'Ship the first release',
  );
  const title = page.getByRole('textbox', { name: 'Issue title' });
  await title.fill('Ship the tested release');
  await title.press('Enter');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit issue description' }).click();
  await page
    .getByRole('textbox', { name: 'Issue description' })
    .fill('## Updated plan\n\nKeep **Markdown** and 日本語.');
  await page.getByLabel('Attach a file').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('The attachment survives storage.'),
  });
  await expect(
    page.getByRole('textbox', { name: 'Issue description' }),
  ).toHaveValue(/notes\.txt/);
  await page.getByRole('button', { name: 'Save description' }).click();
  await expect(
    page.getByRole('heading', { name: 'Updated plan' }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Add a comment' })
    .fill('Verified from the browser.');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(
    page.getByText('Verified from the browser.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    'Ship the tested release',
  );
  await expect(
    page.getByRole('heading', { name: 'Updated plan' }),
  ).toBeVisible();
  const list = await request.get(`/api/v1/workspaces/${workspaceId}/issues`);
  const issue = (await list.json()).items.find(
    (item: { title: string }) => item.title === 'Ship the tested release',
  );
  expect(issue.description).toContain('日本語');
  const filePath = issue.description.match(/\]\((\/api\/[^)]+)\)/)[1];
  const attachment = await request.get(filePath);
  expect(await attachment.text()).toBe('The attachment survives storage.');
  await page.screenshot({
    path: 'reports/screenshots/issue-detail.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Delete issue', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByRole('button', { name: 'Move to trash', exact: true })
    .click();
  await expect(page.getByText('This issue is in the trash.')).toBeVisible();
  const deleted = await request.get(
    `/api/v1/workspaces/${workspaceId}/issues/${issue.id}`,
  );
  expect((await deleted.json()).deletedAt).not.toBeNull();
});

test('creation and cached details open without waiting for a server response', async ({
  page,
  request,
}) => {
  await request.post(`/api/v1/workspaces/${workspaceId}/issues`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { teamId, title: 'Ready for keyboard navigation' },
  });
  await page.goto(`/?workspace=${workspaceId}`);
  await expect(
    page.getByText('Ready for keyboard navigation', { exact: true }),
  ).toBeVisible();
  await page.route('**/api/v1/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.keyboard.press('c');
  await expect(page.getByRole('dialog', { name: 'Create issue' })).toBeVisible({
    timeout: 400,
  });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.screenshot({
    path: 'reports/screenshots/issue-list.png',
    fullPage: true,
  });
  await page
    .getByText('Ready for keyboard navigation', { exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    'Ready for keyboard navigation',
    { timeout: 400 },
  );
});

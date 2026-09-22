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
  const suffix = Date.now().toString(36);
  const workspace = await request.post(
    me.workspaces.length ? '/api/v1/workspaces' : '/api/v1/bootstrap',
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: {
        name: 'Detail behavior',
        slug: `detail-${suffix}`,
      },
    },
  );
  expect(workspace.ok()).toBeTruthy();
  workspaceId = (await workspace.json()).current.id;
  const team = await request.post(`/api/v1/workspaces/${workspaceId}/teams`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { name: 'Engineering', key: 'DET' },
  });
  expect(team.ok()).toBeTruthy();
  teamId = (await team.json()).current.id;
});

async function createIssue(
  request: APIRequestContext,
  title: string,
  description?: string,
) {
  const response = await request.post(
    `/api/v1/workspaces/${workspaceId}/issues`,
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { teamId, title, ...(description ? { description } : {}) },
    },
  );
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return { id: body.current.id, identifier: body.current.identifier };
}

async function getIssue(request: APIRequestContext, issueId: string) {
  const response = await request.get(
    `/api/v1/workspaces/${workspaceId}/issues/${issueId}`,
  );
  return response.json();
}

async function expectDeleted(request: APIRequestContext, issueId: string) {
  await expect
    .poll(async () => (await getIssue(request, issueId)).deletedAt)
    .not.toBeNull();
}

async function expectNotDeleted(request: APIRequestContext, issueId: string) {
  await expect
    .poll(async () => (await getIssue(request, issueId)).deletedAt)
    .toBeNull();
}

async function confirmDelete(page: Page) {
  await page.getByRole('button', { name: 'Delete issue', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Move to trash', exact: true })
    .click();
}

async function openIssue(page: Page, title: string) {
  await page.goto(`/?workspace=${workspaceId}`);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByText(title, { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    title,
  );
}

const commentsRoute = /\/api\/v1\/workspaces\/[^/]+\/issues\/[^/]+\/comments$/;
const issueRoute = /\/api\/v1\/workspaces\/[^/]+\/issues\/[^/]+$/;

test('delete confirmation can be cancelled without a native dialog', async ({
  page,
  request,
}) => {
  const title = `Cancel delete ${crypto.randomUUID()}`;
  const issue = await createIssue(request, title);
  let nativeDialogShown = false;
  page.on('dialog', (dialog) => {
    nativeDialogShown = true;
    void dialog.dismiss();
  });

  await openIssue(page, title);
  await page.getByRole('button', { name: 'Delete issue', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    title,
  );
  expect(nativeDialogShown).toBe(false);

  await expectNotDeleted(request, issue.id);
});

test('delete confirmation commits from the in-app dialog', async ({
  page,
  request,
}) => {
  const title = `Confirm delete ${crypto.randomUUID()}`;
  const issue = await createIssue(request, title);
  let nativeDialogShown = false;
  page.on('dialog', (dialog) => {
    nativeDialogShown = true;
    void dialog.dismiss();
  });

  await openIssue(page, title);
  await confirmDelete(page);
  await expectDeleted(request, issue.id);
  expect(nativeDialogShown).toBe(false);

  await page.reload();
  await expect(page.getByText('This issue is in the trash.')).toBeVisible();
  await page
    .getByRole('button', { name: 'Restore issue', exact: true })
    .click();
  await expect(page.getByText('This issue is in the trash.')).toHaveCount(0);
  await expectNotDeleted(request, issue.id);
});

test('delete failure restores the issue and shows an action error', async ({
  page,
  request,
}) => {
  const title = `Failed delete ${crypto.randomUUID()}`;
  const issue = await createIssue(request, title);
  await openIssue(page, title);
  await page.route(issueRoute, async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'temporary_failure', message: 'Delete failed' },
        }),
      });
      return;
    }
    await route.continue();
  });
  await confirmDelete(page);
  await expect(page.getByRole('alert')).toContainText('Delete failed');
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    title,
  );

  await expectNotDeleted(request, issue.id);
});

test('delete shows pending status and disables restore actions', async ({
  page,
  request,
}) => {
  const title = `Pending delete ${crypto.randomUUID()}`;
  const issue = await createIssue(request, title);
  let releaseDelete!: () => void;
  const deleteGate = new Promise<void>((resolve) => {
    releaseDelete = resolve;
  });
  let deleteStarted = false;
  await openIssue(page, title);
  await page.route(issueRoute, async (route) => {
    if (route.request().method() === 'DELETE') {
      deleteStarted = true;
      await deleteGate;
      await route.continue();
      return;
    }
    await route.continue();
  });
  await confirmDelete(page);
  await expect.poll(() => deleteStarted).toBe(true);
  await expect(
    page.getByText('Moving to trash…', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Restore issue', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Restore', exact: true }),
  ).toBeDisabled();

  releaseDelete();
  await expectDeleted(request, issue.id);
  await expect(
    page.getByRole('button', { name: 'Restore issue', exact: true }),
  ).toBeEnabled();
});

test('description save failure keeps the draft for retry', async ({
  page,
  request,
}) => {
  const title = `Retry description ${crypto.randomUUID()}`;
  const body = `Initial description ${crypto.randomUUID()}`;
  const draft = `Updated description ${crypto.randomUUID()}`;
  const issue = await createIssue(request, title, body);
  await openIssue(page, title);
  let failNext = true;
  await page.route(issueRoute, async (route) => {
    if (route.request().method() === 'PATCH' && failNext) {
      failNext = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'temporary_failure', message: 'Description failed' },
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.getByRole('button', { name: 'Edit issue description' }).click();
  const editor = page.getByRole('textbox', { name: 'Issue description' });
  await editor.fill(draft);
  await page.getByRole('button', { name: 'Save description' }).click();
  await expect(
    page.getByText('Description failed', { exact: true }),
  ).toBeVisible();
  await expect(editor).toHaveValue(draft);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText(draft, { exact: true })).toBeVisible();

  expect((await getIssue(request, issue.id)).description).toBe(draft);
});

test('description editor cancels an unsaved draft', async ({
  page,
  request,
}) => {
  const title = `Cancel description ${crypto.randomUUID()}`;
  const body = `Saved description ${crypto.randomUUID()}`;
  const issue = await createIssue(request, title, body);
  await openIssue(page, title);
  await page.getByRole('button', { name: 'Edit issue description' }).click();
  const editor = page.getByRole('textbox', { name: 'Issue description' });
  await editor.fill(`Discarded description ${crypto.randomUUID()}`);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByText(body, { exact: true })).toBeVisible();

  expect((await getIssue(request, issue.id)).description).toBe(body);
});

test('title Enter during IME composition does not submit', async ({
  page,
  request,
}) => {
  const title = `IME title ${crypto.randomUUID()}`;
  const updatedTitle = `Composed title ${crypto.randomUUID()}`;
  await createIssue(request, title);
  await openIssue(page, title);
  let patchCount = 0;
  await page.route(issueRoute, async (route) => {
    if (route.request().method() === 'PATCH') patchCount += 1;
    await route.continue();
  });

  const titleField = page.getByRole('textbox', { name: 'Issue title' });
  await titleField.fill(updatedTitle);
  await titleField.evaluate((element) => {
    element.dispatchEvent(
      new CompositionEvent('compositionstart', { bubbles: true, data: 'あ' }),
    );
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'Enter',
        isComposing: true,
        key: 'Enter',
        keyCode: 229,
        which: 229,
      }),
    );
  });
  await expect(titleField).toBeFocused();
  expect(patchCount).toBe(0);

  await titleField.evaluate((element) => {
    element.dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true, data: 'あ' }),
    );
  });
  await titleField.press('Enter');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  expect(patchCount).toBe(1);
});

test('comment appears before a delayed response and clears its draft', async ({
  page,
  request,
}) => {
  const title = `Fast comment ${crypto.randomUUID()}`;
  await createIssue(request, title);
  await openIssue(page, title);
  await page.route(commentsRoute, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });

  const body = `Visible before response ${crypto.randomUUID()}`;
  const composer = page.getByRole('textbox', { name: 'Add a comment' });
  await composer.fill(body);
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(composer).toHaveValue('');
  await expect(page.getByText(body, { exact: true })).toBeVisible({
    timeout: 450,
  });
});

test('failed comment keeps a retry draft and commits once', async ({
  page,
  request,
}) => {
  const title = `Retry comment ${crypto.randomUUID()}`;
  const issue = await createIssue(request, title);
  await openIssue(page, title);
  let failNext = true;
  await page.route(commentsRoute, async (route) => {
    if (route.request().method() === 'POST' && failNext) {
      failNext = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'temporary_failure', message: 'Temporary failure' },
        }),
      });
      return;
    }
    await route.continue();
  });

  const body = `Retry this comment ${crypto.randomUUID()}`;
  const composer = page.getByRole('textbox', { name: 'Add a comment' });
  await composer.fill(body);
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(composer).toHaveValue(body);
  await expect(page.getByRole('alert')).toContainText('Temporary failure');
  await page.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  await expect(composer).toHaveValue('');
  await expect(page.getByText('added a comment', { exact: true })).toHaveCount(
    0,
  );

  const response = await request.get(
    `/api/v1/workspaces/${workspaceId}/issues/${issue.id}/comments`,
  );
  const comments = await response.json();
  expect(
    comments.filter((item: { body: string }) => item.body === body),
  ).toHaveLength(1);
});

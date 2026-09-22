import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

let workspaceId = '';
let teamId = '';
let teamStates: Array<{ id: string; name: string; teamId: string }> = [];

test.beforeAll(async ({ request }) => {
  await ensureWorkspace(request);
  const metadata = await (
    await request.get(`/api/v1/workspaces/${workspaceId}/metadata`)
  ).json();
  teamStates = metadata.states
    .filter((state: { teamId: string }) => state.teamId === teamId)
    .sort(
      (a: { position: number }, b: { position: number }) =>
        a.position - b.position,
    );
  expect(teamStates.length).toBeGreaterThan(1);
});

test('status picker searches and selects with keyboard, then persists', async ({
  page,
  request,
}) => {
  const title = `Picker keyboard ${crypto.randomUUID()}`;
  const issue = await createIssue(request, title);
  const currentState = teamStates[0];
  const nextState = teamStates[1];

  await openIssue(page, title);
  const status = page.getByRole('button', { name: 'Status', exact: true });
  await status.click();
  const search = page.getByRole('combobox', {
    name: 'Search Status',
    exact: true,
  });
  const listbox = page.getByRole('listbox', { name: 'Status', exact: true });
  await expect(search).toBeFocused();
  await expect(
    listbox.getByRole('option', { name: currentState.name, exact: true }),
  ).toHaveAttribute('aria-selected', 'true');

  await search.fill('o');
  await expect(listbox.getByRole('option')).toHaveCount(3);
  await expect(
    listbox.getByRole('option', { name: nextState.name, exact: true }),
  ).toBeVisible();
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(status).toContainText(nextState.name, { timeout: 5000 });
  await expect
    .poll(async () => getIssueState(request, issue.id))
    .toBe(nextState.id);

  await page.reload();
  await openIssue(page, title);
  await expect(
    page.getByRole('button', { name: 'Status', exact: true }),
  ).toContainText(nextState.name);
});

test('status picker closes on Escape, outside click, and Tab without changing value', async ({
  page,
  request,
}) => {
  const title = `Picker close ${crypto.randomUUID()}`;
  const issue = await createIssue(request, title);
  const currentState = teamStates[0];
  const alternateState = teamStates[1];

  await openIssue(page, title);
  const status = page.getByRole('button', { name: 'Status', exact: true });
  await status.click();
  const search = page.getByRole('combobox', {
    name: 'Search Status',
    exact: true,
  });
  await search.fill(alternateState.name);
  await search.press('Escape');
  await expect(search).toHaveCount(0);
  await expect(status).toBeFocused();
  await expect(status).toContainText(currentState.name);

  await status.click();
  await page.getByRole('heading', { name: 'Properties', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Search Status' }),
  ).toHaveCount(0);
  await expect(status).toContainText(currentState.name);

  await status.click();
  await page.getByRole('combobox', { name: 'Search Status' }).press('Tab');
  await expect(
    page.getByRole('combobox', { name: 'Search Status' }),
  ).toHaveCount(0);
  await expect
    .poll(async () => getIssueState(request, issue.id))
    .toBe(currentState.id);
});

async function ensureWorkspace(request: APIRequestContext) {
  const me = await (await request.get('/api/v1/me')).json();
  if (me.workspaces.length > 0) {
    workspaceId = me.workspaces[0].id;
    const teams = await (
      await request.get(`/api/v1/workspaces/${workspaceId}/teams`)
    ).json();
    if (teams.length > 0) {
      teamId = teams[0].id;
      return;
    }
  } else {
    const workspace = await request.post('/api/v1/bootstrap', {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { name: 'Picker workspace', slug: 'picker' },
    });
    expect(workspace.ok()).toBeTruthy();
    workspaceId = (await workspace.json()).current.id;
  }
  const team = await request.post(`/api/v1/workspaces/${workspaceId}/teams`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { name: 'Engineering', key: 'PICK' },
  });
  expect(team.ok()).toBeTruthy();
  teamId = (await team.json()).current.id;
}

async function createIssue(request: APIRequestContext, title: string) {
  const response = await request.post(
    `/api/v1/workspaces/${workspaceId}/issues`,
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { teamId, title },
    },
  );
  expect(response.ok()).toBeTruthy();
  return (await response.json()).current as { id: string };
}

async function getIssueState(request: APIRequestContext, issueId: string) {
  const response = await request.get(
    `/api/v1/workspaces/${workspaceId}/issues/${issueId}`,
  );
  return (await response.json()).stateId as string;
}

async function openIssue(page: Page, title: string) {
  await page.goto('/');
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByText(title, { exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveValue(
    title,
  );
}

import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

let workspaceId = '';
let teamId = '';

test.beforeAll(async ({ request }) => {
  const meResponse = await request.get('/api/v1/me');
  expect(meResponse.ok()).toBeTruthy();
  const me = await meResponse.json();
  const suffix = crypto.randomUUID().slice(0, 8);
  const workspaceResponse = await request.post(
    me.workspaces.length ? '/api/v1/workspaces' : '/api/v1/bootstrap',
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: {
        name: `Reconnect workspace ${suffix}`,
        slug: `reconnect-${suffix}`,
      },
    },
  );
  expect(workspaceResponse.ok()).toBeTruthy();
  workspaceId = (await workspaceResponse.json()).current.id;

  const teamResponse = await request.post(
    `/api/v1/workspaces/${workspaceId}/teams`,
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { name: 'Reconnect team', key: `RC${suffix.toUpperCase()}` },
    },
  );
  expect(teamResponse.ok()).toBeTruthy();
  teamId = (await teamResponse.json()).current.id;
});

test('recovers missed updates after reconnecting and resumes live updates', async ({
  browser,
  request,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const transport = await setupReconnectTransport(
    page,
    context,
    `/api/v1/workspaces/${workspaceId}/events`,
  );
  const title = `Reconnect issue ${crypto.randomUUID()}`;
  const initialDescription = `Initial description ${crypto.randomUUID()}`;
  const connectedDescription = `Connected description ${crypto.randomUUID()}`;
  const missedDescription = `Missed description ${crypto.randomUUID()}`;
  const resumedDescription = `Resumed description ${crypto.randomUUID()}`;

  try {
    const issue = await createIssue(request, title, initialDescription);
    const initialSocketPromise = waitForWorkspaceSocket(page);
    await page.goto(`/?workspace=${workspaceId}`);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.getByText(title, { exact: true }).click();
    await expect(
      page.getByRole('textbox', { name: 'Issue title' }),
    ).toHaveValue(title);
    await initialSocketPromise;

    const connectedIssue = await updateIssue(
      page.url(),
      issue.id,
      issue.version,
      connectedDescription,
    );
    await expect(
      page.getByText(connectedDescription, { exact: true }),
    ).toBeVisible();

    transport.setNetworkCut(true);
    await transport.closeSocket();

    const missedIssue = await updateIssue(
      page.url(),
      issue.id,
      connectedIssue.version,
      missedDescription,
    );
    await expect
      .poll(transport.disconnectedRetries, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await expect(
      page.getByText(connectedDescription, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(missedDescription, { exact: true }),
    ).toHaveCount(0);

    transport.setNetworkCut(false);
    const reconnectSocketPromise = waitForWorkspaceSocket(page);
    await reconnectSocketPromise;
    await expect(
      page.getByText(missedDescription, { exact: true }),
    ).toBeVisible();

    await updateIssue(
      page.url(),
      issue.id,
      missedIssue.version,
      resumedDescription,
    );
    await expect(
      page.getByText(resumedDescription, { exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test('an expired session hides cached workspace content', async ({
  page,
  request,
}) => {
  const title = `Authenticated issue ${crypto.randomUUID()}`;
  const issue = await createIssue(request, title, 'Cached private content');
  await page.goto(`/?workspace=${workspaceId}`);
  await page.getByText(title, { exact: true }).click();
  await expect(
    page.getByText('Cached private content', { exact: true }),
  ).toBeVisible();
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'unauthorized', message: 'Session expired' },
      }),
    }),
  );
  await updateIssue(page.url(), issue.id, issue.version, 'Changed on server');
  await expect(page.getByRole('alert')).toContainText('Session expired');
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveCount(
    0,
  );
  await expect(
    page.getByText('Cached private content', { exact: true }),
  ).toHaveCount(0);
});

async function createIssue(
  request: APIRequestContext,
  title: string,
  description: string,
) {
  const response = await request.post(
    `/api/v1/workspaces/${workspaceId}/issues`,
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { teamId, title, description },
    },
  );
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.current.title).toBe(title);
  expect(body.current.description).toBe(description);
  return {
    id: body.current.id,
    version: body.current.version,
  };
}

async function updateIssue(
  pageUrl: string,
  issueId: string,
  expectedVersion: number,
  description: string,
) {
  const url = new URL(
    `/api/v1/workspaces/${workspaceId}/issues/${issueId}`,
    pageUrl,
  );
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
      Connection: 'close',
    },
    body: JSON.stringify({ description, expectedVersion }),
  });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.current.description).toBe(description);
  return {
    version: body.current.version,
  };
}

async function setupReconnectTransport(
  page: Page,
  context: BrowserContext,
  eventsPath: string,
) {
  let networkCut = false;
  let disconnectedRetries = 0;
  let closeRoutedSocket: (() => Promise<void>) | undefined;
  await page.route('**/api/**', async (route) => {
    if (networkCut) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await context.routeWebSocket(new RegExp(`${eventsPath}$`), (socket) => {
    if (networkCut) {
      disconnectedRetries += 1;
      void socket.close({ code: 1001, reason: 'network cut' });
      return;
    }
    const server = socket.connectToServer();
    closeRoutedSocket = async () => {
      await Promise.all([
        socket.close({ code: 1001, reason: 'network cut' }),
        server.close({ code: 1001, reason: 'network cut' }),
      ]);
    };
  });
  return {
    disconnectedRetries: () => disconnectedRetries,
    setNetworkCut: (cut: boolean) => {
      networkCut = cut;
    },
    closeSocket: async () => {
      if (!closeRoutedSocket)
        throw new Error('Live WebSocket route was not opened');
      await closeRoutedSocket();
    },
  };
}

async function waitForWorkspaceSocket(page: Page) {
  return page.waitForEvent('websocket', {
    predicate: (socket) =>
      socket.url().includes(`/api/v1/workspaces/${workspaceId}/events`),
    timeout: 15_000,
  });
}

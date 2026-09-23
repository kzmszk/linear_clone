import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

test('removes a newly private team from a connected viewer while its members stay live', async ({
  browser,
  request,
}) => {
  const fixture = await createPublicIssue(request);
  const viewerEmail = `viewer-${crypto.randomUUID()}@example.test`;
  const invitation = await request.post(
    `/api/v1/workspaces/${fixture.workspaceId}/members`,
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: {
        email: viewerEmail,
        name: 'Viewer',
        role: 'member',
        teamIds: [],
      },
    },
  );
  expect(invitation.status()).toBe(201);

  const viewer = await browser.newContext({
    extraHTTPHeaders: { 'x-test-email': viewerEmail },
  });
  const owner = await browser.newContext();
  try {
    const viewerPage = await viewer.newPage();
    const ownerPage = await owner.newPage();
    await viewerPage.goto(`/?workspace=${fixture.workspaceId}`);
    await viewerPage.getByText(fixture.title, { exact: true }).click();
    await expect(
      viewerPage.getByText(fixture.description, { exact: true }),
    ).toBeVisible();
    await expect(
      viewerPage.getByText(fixture.commentBody, { exact: true }),
    ).toBeVisible();
    await ownerPage.goto(`/?workspace=${fixture.workspaceId}`);
    await ownerPage.getByText(fixture.title, { exact: true }).click();
    await expect(
      ownerPage.getByRole('textbox', { name: 'Issue title' }),
    ).toHaveValue(fixture.title);

    const privacyChange = await request.patch(
      `/api/v1/workspaces/${fixture.workspaceId}/teams/${fixture.teamId}`,
      {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        data: { private: true, expectedVersion: fixture.teamVersion },
      },
    );
    expect(privacyChange.status()).toBe(200);

    await assertRevokedViewer(viewerPage, viewer, fixture);
    await expect(
      ownerPage.getByRole('textbox', { name: 'Issue title' }),
    ).toHaveValue(fixture.title);

    const updated = await request.patch(
      `/api/v1/workspaces/${fixture.workspaceId}/issues/${fixture.issueId}`,
      {
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        data: {
          description: 'Visible to retained team members',
          expectedVersion: fixture.issueVersion,
        },
      },
    );
    expect(updated.status()).toBe(200);
    await expect(
      ownerPage.getByText('Visible to retained team members', { exact: true }),
    ).toBeVisible();
    await expect(
      viewerPage.getByText('Visible to retained team members', { exact: true }),
    ).toHaveCount(0);
  } finally {
    await viewer.close();
    await owner.close();
  }
});

async function assertRevokedViewer(
  page: Page,
  context: BrowserContext,
  fixture: Awaited<ReturnType<typeof createPublicIssue>>,
) {
  await expect(page.getByRole('textbox', { name: 'Issue title' })).toHaveCount(
    0,
  );
  await expect(
    page.getByText(fixture.description, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(fixture.commentBody, { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(fixture.title, { exact: true })).toHaveCount(0);
  const base = `/api/v1/workspaces/${fixture.workspaceId}`;
  expect(
    (await context.request.get(`${base}/issues/${fixture.issueId}`)).status(),
  ).toBe(404);
  const listResponse = await context.request.get(`${base}/issues`);
  expect(listResponse.status()).toBe(200);
  const list = await listResponse.json();
  expect(list.items).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ id: fixture.issueId })]),
  );
  expect(
    (
      await context.request.get(`${base}/issues/${fixture.issueId}/comments`)
    ).status(),
  ).toBe(404);
  await page.getByRole('button', { name: 'Back to issues' }).click();
  await expect(page.getByText(fixture.title, { exact: true })).toHaveCount(0);
}

test('removes cached private issue detail when a team member loses access', async ({
  browser,
  request,
}) => {
  const fixture = await createPublicIssue(request);
  const base = `/api/v1/workspaces/${fixture.workspaceId}`;
  const privacyChange = await request.patch(`${base}/teams/${fixture.teamId}`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: { private: true, expectedVersion: fixture.teamVersion },
  });
  expect(privacyChange.status()).toBe(200);
  const memberEmail = `member-${crypto.randomUUID()}@example.test`;
  const invitation = await request.post(`${base}/members`, {
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    data: {
      email: memberEmail,
      name: 'Member',
      role: 'member',
      teamIds: [fixture.teamId],
    },
  });
  expect(invitation.status()).toBe(201);

  const member = await browser.newContext({
    extraHTTPHeaders: { 'x-test-email': memberEmail },
  });
  const owner = await browser.newContext();
  try {
    const page = await member.newPage();
    await page.goto(`/?workspace=${fixture.workspaceId}`);
    await page.getByText(fixture.title, { exact: true }).click();
    await expect(
      page.getByText(fixture.description, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(fixture.commentBody, { exact: true }),
    ).toBeVisible();
    const ownerPage = await owner.newPage();
    await ownerPage.goto(`/?workspace=${fixture.workspaceId}`);
    await ownerPage.getByText(fixture.title, { exact: true }).click();
    await ownerPage
      .getByRole('button', { name: 'Edit issue description' })
      .click();
    const ownerDraft = ownerPage.getByRole('textbox', {
      name: 'Issue description',
    });
    await ownerDraft.fill('Unsaved owner draft');

    const membersResponse = await request.get(`${base}/members`);
    expect(membersResponse.status()).toBe(200);
    const members = await membersResponse.json();
    const current = members.find(
      (entry: { email: string }) => entry.email === memberEmail,
    );
    expect(current).toBeDefined();
    const removal = await request.patch(`${base}/members/${current.id}`, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { teamIds: [], expectedVersion: current.version },
    });
    expect(removal.status()).toBe(200);

    await assertRevokedViewer(page, member, fixture);
    await expect(ownerDraft).toHaveValue('Unsaved owner draft');
  } finally {
    await member.close();
    await owner.close();
  }
});

for (const commitBeforeRevocation of [false, true]) {
  test(`a delayed ${commitBeforeRevocation ? 'successful' : 'denied'} edit cannot restore revoked issue data`, async ({
    browser,
    request,
  }) => {
    const fixture = await createPublicIssue(request);
    const viewerEmail = `editing-${crypto.randomUUID()}@example.test`;
    const base = `/api/v1/workspaces/${fixture.workspaceId}`;
    const invitation = await request.post(`${base}/members`, {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: {
        email: viewerEmail,
        name: 'Editing viewer',
        role: 'member',
        teamIds: [],
      },
    });
    expect(invitation.status()).toBe(201);
    const viewer = await browser.newContext({
      extraHTTPHeaders: { 'x-test-email': viewerEmail },
    });
    try {
      const page = await viewer.newPage();
      await page.goto(`/?workspace=${fixture.workspaceId}`);
      await page
        .getByRole('button', { name: `Access team ${fixture.teamKey}` })
        .click();
      await page.getByText(fixture.title, { exact: true }).click();
      await expect(
        page.getByText(fixture.description, { exact: true }),
      ).toBeVisible();

      const patch = await holdIssuePatch(
        page,
        `${base}/issues/${fixture.issueId}`,
        commitBeforeRevocation,
      );
      const editedTitle = `Delayed title ${crypto.randomUUID()}`;
      await page
        .getByRole('textbox', { name: 'Issue title' })
        .fill(editedTitle);
      await page.getByRole('heading', { name: 'Properties' }).click();
      await patch.started;

      const privacyChange = await request.patch(
        `${base}/teams/${fixture.teamId}`,
        {
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          data: { private: true, expectedVersion: fixture.teamVersion },
        },
      );
      expect(privacyChange.status()).toBe(200);
      await expect(
        page.getByRole('textbox', { name: 'Issue title' }),
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'Back to issues' }).click();
      const patchResponse = page.waitForResponse(
        (response) => response.request().method() === 'PATCH',
      );
      patch.release();
      expect((await patchResponse).status()).toBe(
        commitBeforeRevocation ? 200 : 404,
      );
      await expect(page.getByText(fixture.title, { exact: true })).toHaveCount(
        0,
      );
      await expect(page.getByText(editedTitle, { exact: true })).toHaveCount(0);
      await expect(
        page.getByText(fixture.description, { exact: true }),
      ).toHaveCount(0);
      expect(
        (
          await viewer.request.get(`${base}/issues?teamId=${fixture.teamId}`)
        ).status(),
      ).toBe(404);
    } finally {
      await viewer.close();
    }
  });
}

async function holdIssuePatch(
  page: Page,
  path: string,
  commitBeforeRevocation: boolean,
) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let signalStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    const response = commitBeforeRevocation ? await route.fetch() : undefined;
    signalStarted();
    await held;
    if (response) await route.fulfill({ response });
    else await route.continue();
  });
  return { started, release };
}

async function createPublicIssue(request: APIRequestContext) {
  const meResponse = await request.get('/api/v1/me');
  expect(meResponse.ok()).toBeTruthy();
  const me = await meResponse.json();
  const suffix = crypto.randomUUID().slice(0, 8);
  const workspaceResponse = await request.post(
    me.workspaces.length ? '/api/v1/workspaces' : '/api/v1/bootstrap',
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { name: `Access test ${suffix}`, slug: `access-${suffix}` },
    },
  );
  expect(workspaceResponse.ok()).toBeTruthy();
  const workspaceId = (await workspaceResponse.json()).current.id;
  const teamResponse = await request.post(
    `/api/v1/workspaces/${workspaceId}/teams`,
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { name: 'Access team', key: `AC${suffix.toUpperCase()}` },
    },
  );
  expect(teamResponse.ok()).toBeTruthy();
  const team = (await teamResponse.json()).current;
  const title = `Accessible issue ${suffix}`;
  const description = `Private description ${suffix}`;
  const issueResponse = await request.post(
    `/api/v1/workspaces/${workspaceId}/issues`,
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { teamId: team.id, title, description },
    },
  );
  expect(issueResponse.ok()).toBeTruthy();
  const issue = (await issueResponse.json()).current;
  const commentBody = `Private comment ${suffix}`;
  const commentResponse = await request.post(
    `/api/v1/workspaces/${workspaceId}/issues/${issue.id}/comments`,
    {
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      data: { body: commentBody },
    },
  );
  expect(commentResponse.status()).toBe(201);
  return {
    workspaceId,
    teamId: team.id,
    teamKey: team.key,
    teamVersion: team.version,
    issueId: issue.id,
    issueVersion: issue.version,
    title,
    description,
    commentBody,
  };
}

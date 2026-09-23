import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from '@playwright/test';
import { api, seed, startRuntime } from './runtime.mjs';

test('events deliver visible changes and close a removed member connection', async () => {
  const runtime = await startRuntime(8905);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    const request = api(runtime.url);
    const fixture = await seed(request);
    await request(`${fixture.base}/members`, {
      method: 'POST',
      body: {
        email: 'other-owner@example.test',
        name: 'Other owner',
        role: 'owner',
        teamIds: [],
      },
    });
    const other = api(runtime.url, 'other-owner@example.test');
    await other('/me');
    const privateTeam = await other(`${fixture.base}/teams`, {
      method: 'POST',
      body: {
        key: 'HIDDEN',
        name: 'Private to another owner',
        private: true,
      },
    });
    assert.equal((await request(`${fixture.base}/events`)).status, 426);
    await openEventStream(page, runtime.url, fixture.base);
    const hidden = await other(`${fixture.base}/issues`, {
      method: 'POST',
      body: {
        teamId: privateTeam.body.current.id,
        title: 'Private event',
      },
    });
    const visible = await request(`${fixture.base}/issues`, {
      method: 'POST',
      body: {
        teamId: fixture.team.id,
        title: 'Visible event',
      },
    });
    await page.waitForFunction(
      (id) => window.eventMessages.some((event) => event.entityId === id),
      visible.body.current.id,
    );
    const seen = await page.evaluate(() => window.eventMessages);
    assert.ok(seen.every((event) => event.entityId !== hidden.body.current.id));
    const feed = await request(`${fixture.base}/changes`);
    assert.ok(
      feed.body.items.some((item) => item.entityId === visible.body.current.id),
    );
    assert.ok(
      feed.body.items.every((item) => item.entityId !== hidden.body.current.id),
    );
    const owner = (await request(`${fixture.base}/members`)).body.find(
      (member) => member.email === 'owner@example.test',
    );
    const removed = await other(`${fixture.base}/members/${owner.id}`, {
      method: 'DELETE',
      body: { expectedVersion: owner.version },
    });
    assert.equal(removed.status, 200);
    await page.waitForFunction(
      () => window.eventCloseCode !== null,
      undefined,
      { timeout: 5000 },
    );
    assert.equal(await page.evaluate(() => window.eventCloseCode), 1008);
    assert.equal((await request(`${fixture.base}/changes`)).status, 404);
  } catch (error) {
    throw new Error(runtime.output().slice(-5000), { cause: error });
  } finally {
    await browser.close();
    await runtime.stop();
  }
});

test('a public-to-private team change closes only a viewer who loses access', async () => {
  const runtime = await startRuntime(8915);
  const browser = await chromium.launch();
  const viewerEmail = 'privacy-viewer@example.test';
  const ownerPage = await browser.newPage();
  const viewerContext = await browser.newContext({
    extraHTTPHeaders: { 'x-test-email': viewerEmail },
  });
  const viewerPage = await viewerContext.newPage();
  try {
    const owner = api(runtime.url);
    const fixture = await seed(owner);
    const invitation = await owner(`${fixture.base}/members`, {
      method: 'POST',
      body: {
        email: viewerEmail,
        name: 'Privacy viewer',
        role: 'member',
        teamIds: [],
      },
    });
    assert.equal(invitation.status, 201);
    const viewer = api(runtime.url, viewerEmail);
    assert.equal((await viewer('/me')).status, 200);
    await openEventStream(ownerPage, runtime.url, fixture.base);
    await openEventStream(viewerPage, runtime.url, fixture.base);

    const privatized = await owner(`${fixture.base}/teams/${fixture.team.id}`, {
      method: 'PATCH',
      body: { private: true, expectedVersion: fixture.team.version },
    });
    assert.equal(privatized.status, 200);
    await viewerPage.waitForFunction(() => window.eventCloseCode !== null);
    assert.equal(await viewerPage.evaluate(() => window.eventCloseCode), 1008);
    await ownerPage.waitForFunction(
      (teamId) =>
        window.eventMessages.some((event) => event.entityId === teamId),
      fixture.team.id,
    );
    const ownerEvents = await ownerPage.evaluate(() => window.eventMessages);
    assert.ok(
      ownerEvents.some(
        (event) =>
          event.entityKind === 'team.privatized' &&
          event.entityId === fixture.team.id,
      ),
    );
    const viewerEvents = await viewerPage.evaluate(() => window.eventMessages);
    assert.deepEqual(
      viewerEvents.map((event) => event.kind),
      ['ready'],
    );
    const viewerChanges = await viewer(`${fixture.base}/changes`);
    assert.equal(viewerChanges.status, 200);
    assert.ok(
      viewerChanges.body.items.every(
        (event) => event.entityId !== fixture.team.id,
      ),
    );
  } catch (error) {
    throw new Error(runtime.output().slice(-5000), { cause: error });
  } finally {
    await browser.close();
    await runtime.stop();
  }
});

async function openEventStream(page, origin, base) {
  await page.goto(`${origin}/api/v1/me`);
  await page.evaluate(
    async (url) => {
      window.eventMessages = [];
      window.eventCloseCode = null;
      const socket = new WebSocket(url);
      await new Promise((resolve) => {
        socket.onmessage = (event) => {
          window.eventMessages.push(JSON.parse(event.data));
          resolve();
        };
        socket.onclose = (event) => {
          window.eventCloseCode = event.code;
        };
      });
    },
    `${origin.replace('http:', 'ws:')}/api/v1${base}/events`,
  );
  assert.equal(
    (await page.evaluate(() => window.eventMessages[0])).kind,
    'ready',
  );
}

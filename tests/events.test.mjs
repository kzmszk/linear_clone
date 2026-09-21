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

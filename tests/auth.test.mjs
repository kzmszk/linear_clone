import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { startRuntime } from './runtime.mjs';

test('production entry verifies real JWTs and rejects local identity headers', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        keys: [{ ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }],
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const issuer = `http://127.0.0.1:${server.address().port}`;
  const token = (audience, expiry) =>
    new SignJWT({ email: 'owner@example.test' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject('owner')
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime(expiry)
      .sign(privateKey);
  let runtime;
  try {
    const valid = await token('linc-test', '5m');
    runtime = await startRuntime(8903, {
      config: 'wrangler.jsonc',
      headers: { Authorization: `Bearer ${valid}` },
      args: [
        '--var',
        `ACCESS_TEAM_DOMAIN:${issuer}`,
        '--var',
        'ACCESS_AUD:linc-test',
        '--var',
        'BOOTSTRAP_OWNER_EMAIL:owner@example.test',
      ],
    });
    const me = await fetch(`${runtime.url}/api/v1/me`, {
      headers: { Authorization: `Bearer ${valid}` },
    });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).principal.email, 'owner@example.test');
    const fakeLocal = await fetch(`${runtime.url}/api/v1/me`, {
      headers: {
        'x-test-email': 'owner@example.test',
        'X-Linc-Actor-Email': 'owner@example.test',
      },
    });
    assert.equal(fakeLocal.status, 401);
    for (const invalid of [
      await token('wrong-app', '5m'),
      await token('linc-test', '0s'),
      `${valid.slice(0, -8)}xxxxxxxx`,
    ]) {
      const denied = await fetch(`${runtime.url}/api/v1/me`, {
        headers: { Authorization: `Bearer ${invalid}` },
      });
      assert.equal(denied.status, 401);
    }
  } finally {
    await runtime?.stop();
    server.close();
  }
});

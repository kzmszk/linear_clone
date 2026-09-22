import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { api, seed, startRuntime } from './runtime.mjs';

export async function localSession() {
  const runtime = await startRuntime(8937);
  const request = api(runtime.url);
  const fixture = await seed(request);
  const state = await mkdtemp(path.join(tmpdir(), 'linc-local-cli-'));
  const offline = path.join(state, 'offline.mjs');
  await writeFile(
    offline,
    "globalThis.fetch = () => { throw new Error('Network is disabled'); };\n",
  );
  const bridge = await syncBridge(runtime.url);
  const session = {
    runtime,
    request,
    fixture,
    state,
    bridge,
    cli(args, options = {}) {
      return runCli(
        localArgs(bridge.url, args, options.email),
        state,
        options.offline ? offline : undefined,
      );
    },
    watch(interval = 1) {
      return startWatch(
        localArgs(bridge.url, ['watch', '--interval', String(interval)]),
        state,
      );
    },
    async stop() {
      await bridge.stop();
      await runtime.stop();
      await rm(state, { recursive: true, force: true });
    },
  };
  return session;
}

function runCli(args, state, offline) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [...(offline ? ['--import', offline] : []), 'dist/cli/linc.mjs', ...args],
      {
        env: { ...process.env, XDG_STATE_HOME: state, XDG_CACHE_HOME: state },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
      },
    );
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({
        code,
        stdout,
        stderr,
        value: stdout.trim() ? JSON.parse(stdout) : null,
      });
    });
  });
}

async function syncBridge(target) {
  let requests = 0;
  let nextResponse;
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const sync = incoming.url.endsWith('/sync');
      if (sync) requests += 1;
      const response = await fetch(`${target}${incoming.url}`, {
        method: incoming.method,
        headers: {
          'content-type': 'application/json',
          'x-test-email':
            incoming.headers['x-test-email'] ?? 'owner@example.test',
          'idempotency-key':
            incoming.headers['idempotency-key'] ?? crypto.randomUUID(),
        },
        ...(body.length ? { body } : {}),
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      const intercept = sync ? nextResponse : undefined;
      if (intercept) nextResponse = undefined;
      if (intercept && (await intercept()) === 'drop') {
        outgoing.destroy();
        return;
      }
      outgoing.writeHead(response.status, {
        'content-type': 'application/json',
      });
      outgoing.end(bytes);
    } catch (error) {
      outgoing.writeHead(502);
      outgoing.end(
        JSON.stringify({ error: { code: 'proxy', message: error.message } }),
      );
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    count: () => requests,
    dropNext() {
      nextResponse = async () => 'drop';
    },
    holdNext() {
      let entered, release;
      const reached = new Promise((resolve) => {
        entered = resolve;
      });
      const released = new Promise((resolve) => {
        release = resolve;
      });
      nextResponse = async () => {
        entered();
        await released;
      };
      return { reached, release };
    },
    async stop() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function localArgs(url, args, email = 'owner@example.test') {
  return [
    '--url',
    url,
    '--workspace',
    'development',
    '--test-email',
    email,
    '--json',
    'local',
    ...args,
  ];
}

function startWatch(args, state) {
  const child = spawn(process.execPath, ['dist/cli/linc.mjs', ...args], {
    env: { ...process.env, XDG_STATE_HOME: state, XDG_CACHE_HOME: state },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
    killSignal: 'SIGKILL',
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const closed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, output }));
  });
  const ready = new Promise((resolve) => child.stdout.once('data', resolve));
  return { child, closed, ready };
}

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { seed, startRuntime } from '../tests/runtime.mjs';
import { sqlWriteProbe } from './sql-write-probe.mjs';

const scratch = await mkdtemp(path.join(tmpdir(), 'linc-sql-writes-'));
const measurements = [];
let runtime;
try {
  const bundle = path.join(scratch, 'worker.mjs');
  await build({
    entryPoints: ['apps/worker/src/local.ts'],
    outfile: bundle,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    external: ['cloudflare:*'],
    loader: { '.sql': 'text' },
    plugins: [sqlWriteProbe],
  });
  const config = path.join(scratch, 'wrangler.json');
  await writeFile(
    config,
    JSON.stringify({
      name: 'linc-sql-writes-local',
      main: bundle,
      compatibility_date: '2026-09-21',
      durable_objects: {
        bindings: [{ name: 'TRACKER', class_name: 'Tracker' }],
      },
      migrations: [{ tag: 'v1', new_sqlite_classes: ['Tracker'] }],
      r2_buckets: [{ binding: 'FILES', bucket_name: 'linc-files-local' }],
      vars: { BOOTSTRAP_OWNER_EMAIL: 'owner@example.test' },
    }),
  );
  runtime = await startRuntime(8944, { config });
  const fixture = await seed(request);
  const metadata = (await request(`${fixture.base}/metadata`)).body;
  const started = metadata.states.find(
    (state) => state.teamId === fixture.team.id && state.type === 'started',
  );
  assert.ok(started);
  const createOptions = {
    method: 'POST',
    operationId: crypto.randomUUID(),
    body: {
      teamId: fixture.team.id,
      title: 'SQL write count',
      description: 'Local measurement',
    },
  };
  const created = await measure(
    'create issue',
    `${fixture.base}/issues`,
    createOptions,
  );
  assert.equal(created.current.title, 'SQL write count');
  const issuePath = `${fixture.base}/issues/${created.current.id}`;
  const updated = await measure('change status to started', issuePath, {
    method: 'PATCH',
    body: { stateId: started.id, expectedVersion: created.current.version },
  });
  assert.equal(updated.current.stateId, started.id);
  assert.equal(updated.current.version, 2);
  for (let index = 1; index <= 3; index++) {
    const comment = await measure(
      `add comment ${index}`,
      `${issuePath}/comments`,
      {
        method: 'POST',
        body: { body: `Local comment ${index}` },
      },
    );
    assert.equal(comment.current.body, `Local comment ${index}`);
  }
  const workflowRowsWritten = measurements.reduce(
    (sum, item) => sum + item.rowsWritten,
    0,
  );
  const listed = await measure('read issues', `${fixture.base}/issues`);
  assert.equal(listed.items.length, 1);
  const comments = await measure('read comments', `${issuePath}/comments`);
  assert.deepEqual(comments.map((comment) => comment.body).sort(), [
    'Local comment 1',
    'Local comment 2',
    'Local comment 3',
  ]);
  const replay = await measure(
    'replay issue creation',
    `${fixture.base}/issues`,
    createOptions,
  );
  assert.equal(replay.kind, 'replayed');
  for (const item of measurements.slice(5)) assert.equal(item.rowsWritten, 0);

  const report = {
    measuredAt: new Date().toISOString(),
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    wranglerVersion: JSON.parse(
      await readFile('node_modules/wrangler/package.json', 'utf8'),
    ).version,
    method:
      'Sequential real HTTP requests to local workerd; sum SqlStorageCursor.rowsWritten after handlers complete. No production requests or latency measurements.',
    scope:
      'Existing workspace, team and authenticated member; one issue without labels, attachments or project; one status change; three comments. Initialization and fixture setup excluded.',
    workflowRowsWritten,
    measurements,
  };
  await mkdir('reports/db-writes', { recursive: true });
  await writeFile(
    'reports/db-writes/local.json',
    `${JSON.stringify(report, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({ workflowRowsWritten, operations: measurements.map(({ operation, rowsWritten }) => ({ operation, rowsWritten })) }, null, 2)}\n`,
  );
} finally {
  await runtime?.stop();
  await rm(scratch, { recursive: true, force: true });
}

async function request(
  route,
  { method = 'GET', body, operationId = crypto.randomUUID() } = {},
) {
  const response = await fetch(`${runtime.url}/api/v1${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-test-email': 'owner@example.test',
      'Idempotency-Key': operationId,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result));
  const trace = response.headers.get('X-Local-Sql-Writes');
  assert.ok(trace, 'Local SQL instrumentation must be active');
  return {
    status: response.status,
    body: result,
    statements: JSON.parse(trace),
  };
}

async function measure(operation, route, options) {
  const result = await request(route, options);
  const statements = result.statements.filter(
    (statement) => statement.rowsWritten > 0,
  );
  measurements.push({
    operation,
    rowsWritten: statements.reduce(
      (sum, statement) => sum + statement.rowsWritten,
      0,
    ),
    sqlCalls: result.statements.length,
    writes: statements,
  });
  return result.body;
}

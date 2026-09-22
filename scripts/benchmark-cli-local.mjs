import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify, parseArgs } from 'node:util';
import { api, seed, startRuntime } from '../tests/runtime.mjs';
import {
  archiveWorkspace,
  authenticatedRequest,
  createWorkspaceFixture,
  seedIssues,
  cliBase,
  expectSuccess,
} from './benchmark-cli-daily-fixture.mjs';
import { benchmarkWorkloads, describeCli } from './benchmark-cli-runner.mjs';
import { localWorkloads } from './benchmark-cli-local-workloads.mjs';

const exec = promisify(execFile);
const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    trials: { type: 'string', default: '10' },
    before: { type: 'string', default: 'dist/cli/linc-local-before.mjs' },
    after: { type: 'string', default: 'dist/cli/linc.mjs' },
    output: {
      type: 'string',
      default: 'artifacts/private/local-first/benchmark.json',
    },
  },
});
const trials = Number(values.trials);
assert.ok(Number.isInteger(trials) && trials > 0);
const clis = {
  before: path.resolve(values.before),
  after: path.resolve(values.after),
};
const output = path.resolve(values.output);
await mkdir(path.dirname(output), { recursive: true });
const state = await mkdtemp(path.join(path.dirname(output), 'state-'));
const environment = {
  cwd: process.cwd(),
  env: { ...process.env, XDG_STATE_HOME: state, XDG_CACHE_HOME: state },
};
let runtime, request, url;
const fixtures = {};
const workspaces = [];
const report = {
  capturedAt: new Date().toISOString(),
  status: 'running',
  environment: { node: process.version, platform: process.platform },
  timingBoundary:
    'Child process spawn through exit. Remote means server commit; local means durable local commit, not server commit. Setup, synchronization and verification excluded from daily operation times.',
  fixture: { open: 20, closed: 200 },
  trials,
  artifacts: {
    before: await describeCli(clis.before, values.before),
    after: await describeCli(clis.after, values.after),
  },
  workloads: [],
  failures: [],
  cleanup: { archivedWorkspaces: [], errors: [] },
};

async function local(args, traceName) {
  const tracePath = path.join(state, `${traceName ?? 'unused'}.json`);
  const env = { ...environment.env };
  if (traceName) {
    env.NODE_OPTIONS =
      `${env.NODE_OPTIONS ?? ''} --import=${path.resolve('scripts/benchmark-cli-daily-fetch-trace.mjs')}`.trim();
    env.LINC_BENCHMARK_TRACE_FILE = tracePath;
  }
  const started = performance.now();
  const result = await exec(
    process.execPath,
    [
      clis.after,
      ...cliBase(url, fixtures.after, Boolean(runtime), 'slug'),
      'local',
      ...args,
    ],
    { env, maxBuffer: 8 * 1024 * 1024 },
  );
  const elapsedMs = performance.now() - started;
  return {
    value: JSON.parse(result.stdout),
    elapsedMs,
    ...(traceName
      ? { http: JSON.parse(await readFile(tracePath, 'utf8')) }
      : {}),
  };
}

async function prepare() {
  if (values.url) {
    url = values.url;
    request = await authenticatedRequest(url);
  } else {
    runtime = await startRuntime(8939);
    url = runtime.url;
    request = api(url);
    await seed(request);
  }
  report.target = url;
  const suffix = randomUUID().slice(0, 8);
  for (const variant of ['before', 'after']) {
    fixtures[variant] = await createWorkspaceFixture(
      request,
      suffix,
      variant,
      (workspace) => {
        workspaces.push(workspace);
      },
    );
    fixtures[variant].createdIds = [];
    fixtures[variant].commentIds = [];
    await seedIssues(request, fixtures[variant], report.fixture);
  }
  report.initialSync = await local(['init'], 'init');
  assert.equal(report.initialSync.http.requestCount, 1);
}

async function verifySynchronized(fixture) {
  const base = `/workspaces/${fixture.workspace.id}`;
  for (const [index, id] of fixture.createdIds.entries()) {
    const issue = expectSuccess(
      await request(`${base}/issues/${id}`),
      'verify created issue',
    );
    assert.equal(issue.title, `Local benchmark ${index}`);
    assert.match(issue.identifier, /^BENCH-/);
  }
  const comments = expectSuccess(
    await request(`${base}/issues/${fixture.issueIds.open[0]}/comments`),
    'verify comments',
  );
  assert.deepEqual(
    comments.map((comment) => comment.id).sort(),
    [...fixture.commentIds].sort(),
  );
  const issue = expectSuccess(
    await request(`${base}/issues/${fixture.issueIds.open[0]}`),
    'verify state',
  );
  assert.equal(issue.version, trials + 1);
  assert.equal(
    issue.stateId,
    (trials - 1) % 2 ? fixture.states.open.id : fixture.states.started.id,
  );
}

async function measureDaily() {
  for (const workload of localWorkloads(url, fixtures, Boolean(runtime))) {
    process.stderr.write(`${workload.name}\n`);
    report.workloads.push(
      ...(await benchmarkWorkloads({
        workloads: [workload],
        trials,
        clis,
        environment,
      })),
    );
    await writeFile(output, JSON.stringify(report, null, 2));
  }
  const probe = await local(['issue', 'list', '--all'], 'local-list');
  assert.equal(probe.http.requestCount, 0);
  report.localReadTrace = probe.http;
  report.dailySync = await local(['sync'], 'daily-sync');
  assert.equal(report.dailySync.value.accepted, trials * 3);
  assert.equal(report.dailySync.value.pending, 0);
  assert.equal(report.dailySync.http.requestCount, 1);
  for (const fixture of Object.values(fixtures))
    await verifySynchronized(fixture);
}

async function measureBulk() {
  const ids = [];
  const localStart = performance.now();
  for (let index = 0; index < 100; index += 1) {
    const created = await local([
      'issue',
      'create',
      '--team',
      'BENCH',
      '--title',
      `Bulk local ${index}`,
    ]);
    ids.push(created.value.id);
  }
  const localElapsedMs = performance.now() - localStart;
  const synchronized = await local(['sync'], 'bulk-sync');
  assert.equal(synchronized.value.accepted, 100);
  assert.equal(synchronized.value.pending, 0);
  assert.equal(synchronized.http.requestCount, 1);
  for (const [index, id] of ids.entries()) {
    const issue = expectSuccess(
      await request(`/workspaces/${fixtures.after.workspace.id}/issues/${id}`),
      'verify bulk issue',
    );
    assert.equal(issue.title, `Bulk local ${index}`);
  }
  report.bulk = {
    count: 100,
    localElapsedMs,
    localMode: '100 sequential independent CLI processes',
    sync: synchronized,
    verifiedCount: ids.length,
  };
}

try {
  await prepare();
  await measureDaily();
  await measureBulk();
  report.status = 'complete';
} catch (error) {
  report.status = 'failed';
  report.failures.push({ message: error.message });
  process.exitCode = 1;
} finally {
  for (const workspace of workspaces) {
    try {
      report.cleanup.archivedWorkspaces.push(
        await archiveWorkspace(request, workspace),
      );
    } catch (error) {
      report.cleanup.errors.push({
        workspaceId: workspace.id,
        message: error.message,
      });
      process.exitCode = 1;
    }
  }
  await runtime?.stop();
  report.fixture.workspaceIds = Object.fromEntries(
    Object.entries(fixtures).map(([key, fixture]) => [
      key,
      fixture.workspace.id,
    ]),
  );
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(`${output}\n`);
}

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { api, seed, startRuntime } from '../tests/runtime.mjs';
import {
  archiveWorkspace,
  authenticatedRequest,
  createWorkspaceFixture,
  isLocalUrl,
  seedIssues,
} from './benchmark-cli-daily-fixture.mjs';
import { runScenario } from './benchmark-cli-daily-cache-runner.mjs';
import {
  describeCli,
  resolveCli,
  sourceBaseline,
} from './benchmark-cli-daily-runner.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const { values } = parseArgs({
  options: {
    before: { type: 'string', default: 'dist/cli/linc-daily-before.mjs' },
    after: { type: 'string', default: 'dist/cli/linc.mjs' },
    output: {
      type: 'string',
      default: 'artifacts/private/cli-benchmark-daily-cache.json',
    },
    trials: { type: 'string', default: '10' },
    url: { type: 'string' },
    port: { type: 'string', default: '8928' },
    phase: { type: 'string', default: 'final' },
    'open-count': { type: 'string', default: '20' },
    'closed-count': { type: 'string', default: '200' },
    'workspace-form': { type: 'string', default: 'id' },
  },
});

function positiveInteger(value, name) {
  const result = Number(value);
  assert.ok(Number.isInteger(result) && result > 0, `${name} must be positive`);
  return result;
}

const settings = {
  trials: positiveInteger(values.trials, '--trials'),
  port: positiveInteger(values.port, '--port'),
  phase: values.phase,
  workspaceForm: values['workspace-form'],
  counts: {
    open: positiveInteger(values['open-count'], '--open-count'),
    closed: positiveInteger(values['closed-count'], '--closed-count'),
  },
};
assert.ok(
  ['baseline', 'final'].includes(settings.phase),
  '--phase must be baseline or final',
);
assert.ok(
  ['id', 'slug'].includes(settings.workspaceForm),
  '--workspace-form must be id or slug',
);

function reportFor(context, workloads, fixtures, target) {
  return Promise.all([
    sourceBaseline(),
    describeCli(context.paths.before, values.before),
    describeCli(context.paths.after, values.after),
  ]).then(([source, before, after]) => ({
    schemaVersion: 1,
    phase: settings.phase,
    capturedAt: new Date().toISOString(),
    target,
    timingBoundary:
      'performance.now() immediately before the timed CLI spawn through process close; cache prime, API update and verification are excluded',
    httpTrace:
      'Omitted for cache scenarios. Each timed run uses an isolated cache home so a later diagnostic request cannot change cold or warm state.',
    environment: {
      node: process.version,
      nodeBinary: process.execPath,
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
    },
    sourceBaseline: source,
    artifacts: { before, after },
    trialsPerScenario: settings.trials,
    fixture: {
      counts: settings.counts,
      teamKey: 'BENCH',
      projectName: 'Daily benchmark project',
      workspaceForm: settings.workspaceForm,
      states: { open: 'Backlog', closed: 'Done' },
      workspaceIds: Object.fromEntries(
        Object.entries(fixtures).map(([variant, fixture]) => [
          variant,
          fixture.workspace.id,
        ]),
      ),
    },
    scenarios: {
      cold: 'Empty XDG_CACHE_HOME before the timed read.',
      warmUnchanged: 'Prime the isolated cache, then time an unchanged read.',
      warmAfterRemoteUpdate:
        'Prime the isolated cache, update one open issue through the API, then time the read and require the new title/version.',
    },
    workloads,
  }));
}

async function runBenchmark(runtime) {
  const target = new URL(values.url ?? runtime.url)
    .toString()
    .replace(/\/$/u, '');
  const local = isLocalUrl(target);
  const request =
    values.url && !local ? await authenticatedRequest(target) : api(target);
  const cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'linc-daily-cache-'));
  const fixtures = {};
  const createdWorkspaces = [];
  let report;
  try {
    if (runtime) await seed(request);
    const suffix = randomUUID().slice(0, 8);
    for (const variant of ['before', 'after']) {
      fixtures[variant] = await createWorkspaceFixture(
        request,
        suffix,
        variant,
        (workspace) => createdWorkspaces.push(workspace),
      );
      await seedIssues(request, fixtures[variant], settings.counts);
    }
    const context = {
      url: target,
      local,
      workspaceForm: settings.workspaceForm,
      request,
      fixtures,
      counts: settings.counts,
      trials: settings.trials,
      cacheRoot,
      paths: {
        before: await resolveCli(values.before),
        after: await resolveCli(values.after),
      },
      environment: { cwd: repositoryRoot, env: { ...process.env } },
    };
    const workloads = [];
    for (const scenario of [
      'cold',
      'warm-unchanged',
      'warm-after-remote-update',
    ])
      workloads.push(await runScenario(context, scenario));
    report = await reportFor(context, workloads, fixtures, target);
  } finally {
    const archivedWorkspaces = [];
    const cleanupErrors = [];
    for (const workspace of createdWorkspaces.reverse()) {
      try {
        archivedWorkspaces.push(await archiveWorkspace(request, workspace));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        cleanupErrors.push({ id: workspace.id, message });
        process.stderr.write(
          `cleanup failed for workspace ${workspace.id}: ${message}\n`,
        );
      }
    }
    await rm(cacheRoot, { recursive: true, force: true });
    await runtime?.stop();
    if (report) report.cleanup = { archivedWorkspaces, errors: cleanupErrors };
  }
  return report;
}

async function main() {
  const runtime = values.url ? null : await startRuntime(settings.port);
  const report = await runBenchmark(runtime);
  const outputPath = path.resolve(repositoryRoot, values.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  if (report.cleanup.errors.length)
    throw new Error(
      `Fixture cleanup failed for ${report.cleanup.errors.length} workspace(s).`,
    );
  process.stdout.write(`${outputPath}\n`);
}

await main();

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
import { createDailyWorkloads } from './benchmark-cli-daily-workloads.mjs';
import {
  describeCli,
  resolveCli,
  runWorkload,
  sourceBaseline,
} from './benchmark-cli-daily-runner.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const { values } = parseArgs({
  options: {
    before: { type: 'string', default: 'dist/cli/linc-daily-before.mjs' },
    after: { type: 'string', default: 'dist/cli/linc.mjs' },
    output: {
      type: 'string',
      default: 'artifacts/private/cli-benchmark-daily.json',
    },
    trials: { type: 'string', default: '10' },
    url: { type: 'string' },
    port: { type: 'string', default: '8927' },
    phase: { type: 'string', default: 'final' },
    trace: { type: 'boolean', default: false },
    'workspace-form': { type: 'string', default: 'id' },
    'open-count': { type: 'string', default: '20' },
    'closed-count': { type: 'string', default: '200' },
  },
});

function positiveInteger(value, name) {
  const result = Number(value);
  assert.ok(Number.isInteger(result) && result > 0, `${name} must be positive`);
  return result;
}

const options = {
  trials: positiveInteger(values.trials, '--trials'),
  port: positiveInteger(values.port, '--port'),
  phase: values.phase,
  trace: values.trace,
  workspaceForm: values['workspace-form'],
  counts: {
    open: positiveInteger(values['open-count'], '--open-count'),
    closed: positiveInteger(values['closed-count'], '--closed-count'),
  },
};
assert.ok(
  ['baseline', 'final'].includes(options.phase),
  '--phase must be baseline or final',
);
assert.ok(
  ['id', 'slug'].includes(options.workspaceForm),
  '--workspace-form must be id or slug',
);

function reportFor(reportOptions, workloads, fixtures, target) {
  return Promise.all([
    sourceBaseline(),
    describeCli(reportOptions.paths.before, values.before),
    describeCli(reportOptions.paths.after, values.after),
  ]).then(([source, before, after]) => ({
    schemaVersion: 1,
    phase: options.phase,
    capturedAt: new Date().toISOString(),
    target,
    timingBoundary:
      'performance.now() immediately before CLI spawn through process close; fixture setup and API verification are excluded',
    httpTrace: reportOptions.trace
      ? 'Separate unmeasured child runs use a fetch preload to count request and response body bytes without recording URLs, headers, tokens, or bodies.'
      : 'Disabled. Pass --trace for separate unmeasured fetch-count runs.',
    environment: {
      node: process.version,
      nodeBinary: process.execPath,
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
    },
    sourceBaseline: source,
    artifacts: { before, after },
    trialsPerWorkload: options.trials,
    fixture: {
      counts: options.counts,
      teamKey: 'BENCH',
      projectName: 'Daily benchmark project',
      workspaceForm: options.workspaceForm,
      states: { open: 'Backlog', update: 'In Progress', closed: 'Done' },
      workspaceIds: Object.fromEntries(
        Object.entries(fixtures).map(([variant, fixture]) => [
          variant,
          fixture.workspace.id,
        ]),
      ),
    },
    semantics: {
      defaultList:
        options.phase === 'final'
          ? 'before returns open plus closed; after excludes closed'
          : 'baseline phase expects both executables to return open plus closed',
      filteredList:
        'Both executables use --state Backlog and must return only the open fixture issues.',
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
  const traceDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'linc-daily-trace-'),
  );
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
      await seedIssues(request, fixtures[variant], options.counts);
    }
    const reportOptions = {
      paths: {
        before: await resolveCli(values.before),
        after: await resolveCli(values.after),
      },
      environment: {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          XDG_CACHE_HOME: path.join(traceDirectory, 'cache'),
        },
      },
      traceDirectory,
      trials: options.trials,
      trace: options.trace,
    };
    const workloadOptions = {
      url: target,
      fixtures,
      local,
      request,
      phase: options.phase,
      workspaceForm: options.workspaceForm,
      counts: options.counts,
    };
    const workloads = [];
    for (const workload of createDailyWorkloads(workloadOptions))
      workloads.push(await runWorkload(workload, reportOptions));
    report = await reportFor(reportOptions, workloads, fixtures, target);
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
    await rm(traceDirectory, { recursive: true, force: true });
    await runtime?.stop();
    if (report)
      report.cleanup = {
        archivedWorkspaces,
        errors: cleanupErrors,
      };
  }
  return report;
}

async function main() {
  const runtime = values.url ? null : await startRuntime(options.port);
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

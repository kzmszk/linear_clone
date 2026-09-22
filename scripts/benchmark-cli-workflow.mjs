import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { arch, homedir, platform, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { api, seed, startRuntime } from '../tests/runtime.mjs';
import { describeCli } from './benchmark-cli-runner.mjs';
import {
  buildWorkflow,
  requestValue,
  verifyWorkflow,
} from './benchmark-cli-workflow-fixture.mjs';

const { values } = parseArgs({
  options: {
    before: { type: 'string' },
    after: { type: 'string' },
    output: { type: 'string' },
    trials: { type: 'string', default: '5' },
    url: { type: 'string' },
    'before-mode': { type: 'string', default: 'single' },
    'after-mode': { type: 'string', default: 'batch' },
  },
});
assert.ok(
  values.before && values.after && values.output,
  'Require --before, --after and --output',
);
assert.ok(
  ['single', 'batch'].includes(values['after-mode']),
  '--after-mode must be single or batch',
);
assert.ok(
  ['single', 'batch'].includes(values['before-mode']),
  '--before-mode must be single or batch',
);
const trials = Number(values.trials);
assert.ok(Number.isInteger(trials) && trials > 0, '--trials must be positive');

async function authenticatedRequest(url) {
  const configPath =
    process.env.LINC_CONFIG ??
    join(
      process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
      'linc/config.json',
    );
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const token = config.profiles[url]?.accessToken;
  assert.ok(token, 'No saved Access login for this URL');
  return async (route, { method = 'GET', body } = {}) => {
    const response = await fetch(`${url}/api/v1${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Cf-Access-Token': token,
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
}

function execute(cli, args, input) {
  return new Promise((resolveRun, reject) => {
    let stdout = '',
      stderr = '';
    const started = performance.now();
    const child = spawn(process.execPath, [resolve(cli), ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    child.on('error', reject);
    child.stdin.on('error', reject);
    child.stdin.end(input);
    child.on('close', (code) => {
      const elapsedMs = performance.now() - started;
      if (code !== 0) {
        reject(new Error(`CLI exited ${code}: ${stderr}`));
        return;
      }
      resolveRun({ elapsedMs, stdout });
    });
  });
}

async function measure(cli, globals, commands, batch) {
  const samples = [];
  const started = performance.now();
  if (batch)
    samples.push(
      await execute(
        cli,
        [...globals, 'batch'],
        commands.map((args) => JSON.stringify(args)).join('\n') + '\n',
      ),
    );
  else
    for (const command of commands)
      samples.push(await execute(cli, [...globals, ...command]));
  const elapsedMs = performance.now() - started;
  const results = samples.flatMap((sample) =>
    sample.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line)),
  );
  assert.equal(results.length, 62);
  assert.ok(results.every((result) => result.kind === 'committed'));
  return { elapsedMs, commandMs: samples.map((sample) => sample.elapsedMs) };
}

function summary(samples, label) {
  const valuesMs = samples
    .filter((sample) => sample.variant === label)
    .map((sample) => sample.elapsedMs)
    .sort((a, b) => a - b);
  const middle = Math.floor(valuesMs.length / 2);
  return {
    medianMs:
      valuesMs.length % 2
        ? valuesMs[middle]
        : (valuesMs[middle - 1] + valuesMs[middle]) / 2,
    p95Ms: valuesMs[Math.ceil(valuesMs.length * 0.95) - 1],
  };
}

async function runTrials(request, url, workspaces, local) {
  const samples = [];
  for (let trial = 0; trial < trials; trial += 1) {
    const order = trial % 2 === 0 ? ['before', 'after'] : ['after', 'before'];
    for (const variant of order) {
      const workspace = workspaces[variant];
      const base = `/workspaces/${workspace.id}`;
      const globals = [
        '--url',
        url,
        '--workspace',
        workspace.slug,
        '--json',
        ...(local ? ['--test-email', 'owner@example.test'] : []),
      ];
      const key = `P${trial}`;
      const team = (
        await requestValue(request, `${base}/teams`, {
          method: 'POST',
          body: { key, name: key },
        })
      ).current;
      const metadata = await requestValue(request, `${base}/metadata`);
      const states = {
        started: metadata.states.find(
          (state) => state.teamId === team.id && state.type === 'started',
        ),
        completed: metadata.states.find(
          (state) => state.teamId === team.id && state.type === 'completed',
        ),
      };
      assert.ok(states.started && states.completed);
      const names = [`${key} projA`, `${key} projB`];
      const commands = buildWorkflow(key, ...names, states);
      const measured = await measure(
        values[variant],
        globals,
        commands,
        values[`${variant}-mode`] === 'batch',
      );
      const verification = await verifyWorkflow(
        request,
        base,
        team,
        names,
        states.completed,
      );
      const sample = {
        trial: trial + 1,
        order,
        variant,
        teamId: team.id,
        ...measured,
        verification,
      };
      samples.push(sample);
      process.stdout.write(
        `${JSON.stringify({ trial: trial + 1, variant, elapsedMs: measured.elapsedMs })}\n`,
      );
    }
  }
  return samples;
}

async function buildReport(url, workspaces, samples) {
  const before = summary(samples, 'before');
  const after = summary(samples, 'after');
  return {
    capturedAt: new Date().toISOString(),
    target: url,
    node: process.version,
    environment: {
      platform: platform(),
      release: release(),
      architecture: arch(),
    },
    workload:
      '62 ordered mutations: 2 projects, 20 issues, 10 started, 10 moved, 20 completed; team key, project name, issue identifier and state UUID references; fresh team per variant; same operations and payload shape',
    timingBoundary:
      'CLI process startup through final process close, including sequential orchestration; fixture creation and verification excluded',
    beforeMode:
      values['before-mode'] === 'batch'
        ? 'one foreground batch process, 62 sequential commands'
        : '62 separate sequential CLI processes',
    afterMode:
      values['after-mode'] === 'batch'
        ? 'one foreground batch process, 62 sequential commands'
        : '62 separate sequential CLI processes',
    caveat:
      'Measures full serial workflow throughput. Batch mode is not cold single-command latency. Separate workspaces start equal and receive the same fixture growth at each paired trial.',
    workspaceIds: Object.fromEntries(
      Object.entries(workspaces).map(([variant, workspace]) => [
        variant,
        workspace.id,
      ]),
    ),
    trialsPerVariant: trials,
    percentileMethod:
      'nearest rank; with fewer than 20 trials p95 is the maximum observed sample',
    samples,
    before,
    after,
    ratioOfMedians: before.medianMs / after.medianMs,
    artifacts: {
      before: await describeCli(resolve(values.before), values.before),
      after: await describeCli(resolve(values.after), values.after),
    },
  };
}

async function main() {
  const runtime = values.url ? null : await startRuntime(8917);
  const url = values.url ?? runtime.url;
  const request = values.url ? await authenticatedRequest(url) : api(url);
  const workspaces = {};
  const archivedWorkspaces = [];
  let report;
  try {
    if (runtime) await seed(request);
    const suffix = crypto.randomUUID().slice(0, 8);
    for (const variant of ['before', 'after']) {
      workspaces[variant] = (
        await requestValue(request, '/workspaces', {
          method: 'POST',
          body: {
            name: `CLI performance ${suffix} ${variant}`,
            slug: `cli-perf-${suffix}-${variant}`,
          },
        })
      ).current;
    }
    const samples = await runTrials(request, url, workspaces, Boolean(runtime));
    report = await buildReport(url, workspaces, samples);
  } finally {
    try {
      for (const workspace of Object.values(workspaces)) {
        const archived = await requestValue(
          request,
          `/workspaces/${workspace.id}`,
          {
            method: 'PATCH',
            body: {
              expectedVersion: workspace.version,
              archivedAt: new Date().toISOString(),
            },
          },
        );
        assert.ok(archived.current.archivedAt);
        archivedWorkspaces.push({
          id: workspace.id,
          archivedAt: archived.current.archivedAt,
        });
      }
    } finally {
      await runtime?.stop();
    }
  }
  report.archivedWorkspaces = archivedWorkspaces;
  await mkdir(dirname(resolve(values.output)), { recursive: true });
  await writeFile(values.output, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(
    `${JSON.stringify({ before: report.before, after: report.after, ratioOfMedians: report.ratioOfMedians })}\n`,
  );
}

await main();

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  cliBase,
  expectSuccess,
  mutationCurrent,
  parseJson,
} from './benchmark-cli-daily-fixture.mjs';
import { stdoutInfo } from './benchmark-cli-daily-runner.mjs';

function listArgs(context, fixture) {
  return [
    ...cliBase(context.url, fixture, context.local, context.workspaceForm),
    'issue',
    'list',
    '--state',
    'Backlog',
  ];
}

function runCommand(cliPath, args, environment, cacheHome) {
  return new Promise((resolveRun, reject) => {
    const started = performance.now();
    execFile(
      process.execPath,
      [cliPath, ...args],
      {
        cwd: environment.cwd,
        env: { ...environment.env, XDG_CACHE_HOME: cacheHome, NO_COLOR: '1' },
        maxBuffer: 4 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(`${path.basename(cliPath)} failed: ${stderr || stdout}`),
          );
          return;
        }
        resolveRun({
          elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
          stdout,
          stdoutInfo: stdoutInfo(stdout),
        });
      },
    );
  });
}

async function cacheHome(root, scenario, trial, variant) {
  const home = path.join(root, scenario, `trial-${trial + 1}`, variant);
  await mkdir(home, { recursive: true });
  return home;
}

function verifyList(stdout, fixture, counts, update) {
  const items = parseJson(stdout, 'cached issue list');
  assert.equal(items.length, counts.open, 'cached open list count');
  assert.deepEqual(
    new Set(items.map(({ id }) => id)),
    new Set(fixture.issueIds.open),
    'cached open list contents',
  );
  if (!update) return { count: items.length, closed: 0 };
  const current = items.find(({ id }) => id === update.issueId);
  assert.ok(current, 'remote-updated issue is present in cached list');
  assert.equal(current.title, update.title, 'cached list has remote title');
  assert.equal(
    current.version,
    update.version,
    'cached list has remote version',
  );
  return {
    count: items.length,
    closed: 0,
    updatedIssueId: current.id,
    updatedVersion: current.version,
  };
}

async function createCases(context, scenario, trial, prime) {
  const cases = {};
  for (const [variant, fixture] of Object.entries(context.fixtures)) {
    cases[variant] = {
      cacheHome: await cacheHome(context.cacheRoot, scenario, trial, variant),
      args: listArgs(context, fixture),
      prime,
    };
  }
  return cases;
}

async function prepareRemoteTrial(context, trial) {
  const cases = await createCases(
    context,
    'warm-after-remote-update',
    trial,
    false,
  );
  const updates = {};
  for (const [variant, fixture] of Object.entries(context.fixtures)) {
    const primed = await runCommand(
      context.paths[variant],
      cases[variant].args,
      context.environment,
      cases[variant].cacheHome,
    );
    verifyList(primed.stdout, fixture, context.counts);
  }
  for (const [variant, fixture] of Object.entries(context.fixtures)) {
    const issueId = fixture.issueIds.open[trial % context.counts.open];
    const current = expectSuccess(
      await context.request(
        `/workspaces/${fixture.workspace.id}/issues/${issueId}`,
      ),
      `read remote update issue ${issueId}`,
    );
    const title = `Daily remote update ${trial + 1}`;
    const updated = mutationCurrent(
      await context.request(
        `/workspaces/${fixture.workspace.id}/issues/${issueId}`,
        {
          method: 'PATCH',
          body: { expectedVersion: current.version, title },
        },
      ),
      `update remote issue ${issueId}`,
    );
    assert.equal(updated.version, current.version + 1);
    updates[variant] = { issueId, title, version: updated.version };
  }
  return {
    cases,
    updates,
    cacheState: 'warm-after-remote-update',
    primed: true,
  };
}

async function prepareTrial(context, scenario, trial) {
  if (scenario === 'cold') {
    return {
      cases: await createCases(context, scenario, trial, false),
      cacheState: 'cold',
      primed: false,
      updates: null,
    };
  }
  if (scenario === 'warm-unchanged') {
    return {
      cases: await createCases(context, scenario, trial, true),
      cacheState: 'warm-unchanged',
      primed: true,
      updates: null,
    };
  }
  return prepareRemoteTrial(context, trial);
}

async function runScenario(context, scenario) {
  const samples = [];
  for (let trial = 0; trial < context.trials; trial += 1) {
    const prepared = await prepareTrial(context, scenario, trial);
    const order = trial % 2 === 0 ? ['before', 'after'] : ['after', 'before'];
    const results = {};
    for (const variant of order) {
      const item = prepared.cases[variant];
      if (item.prime) {
        const primed = await runCommand(
          context.paths[variant],
          item.args,
          context.environment,
          item.cacheHome,
        );
        verifyList(primed.stdout, context.fixtures[variant], context.counts);
      }
      results[variant] = await runCommand(
        context.paths[variant],
        item.args,
        context.environment,
        item.cacheHome,
      );
    }
    const verification = {};
    for (const variant of ['before', 'after'])
      verification[variant] = verifyList(
        results[variant].stdout,
        context.fixtures[variant],
        context.counts,
        prepared.updates?.[variant],
      );
    samples.push({
      trial: trial + 1,
      order,
      cacheState: prepared.cacheState,
      primedOutsideTiming: prepared.primed,
      before: {
        elapsedMs: results.before.elapsedMs,
        stdout: results.before.stdoutInfo,
      },
      after: {
        elapsedMs: results.after.elapsedMs,
        stdout: results.after.stdoutInfo,
      },
      verification,
    });
    process.stdout.write(
      `${JSON.stringify({ scenario, trial: trial + 1, order })}\n`,
    );
  }
  return {
    name: `list-cache-${scenario}`,
    command: 'linc issue list --state Backlog',
    samples,
    summary: summarize(samples),
  };
}

function summarize(samples) {
  const result = {};
  for (const variant of ['before', 'after']) {
    const valuesMs = samples
      .map((sample) => sample[variant].elapsedMs)
      .sort((left, right) => left - right);
    const middle = Math.floor(valuesMs.length / 2);
    result[variant] = {
      medianMs:
        valuesMs.length % 2
          ? valuesMs[middle]
          : (valuesMs[middle - 1] + valuesMs[middle]) / 2,
      p95Ms: valuesMs[Math.max(0, Math.ceil(valuesMs.length * 0.95) - 1)],
    };
  }
  result.ratioOfMedians = result.before.medianMs / result.after.medianMs;
  result.ratioOfP95 = result.before.p95Ms / result.after.p95Ms;
  return result;
}

export { runScenario };

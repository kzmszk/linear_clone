import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { describeCli } from './benchmark-cli-runner.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const traceModule = path.resolve(
  repositoryRoot,
  'scripts/benchmark-cli-daily-fetch-trace.mjs',
);

export function stdoutInfo(stdout) {
  return {
    bytes: Buffer.byteLength(stdout),
    sha256: createHash('sha256').update(stdout).digest('hex'),
  };
}

async function readTrace(tracePath) {
  try {
    return JSON.parse(await readFile(tracePath, 'utf8'));
  } catch {
    throw new Error(`Missing fetch trace ${path.basename(tracePath)}`);
  } finally {
    await rm(tracePath, { force: true });
  }
}

function runCli(cliPath, args, environment, traceDirectory, name, traced) {
  return new Promise((resolveRun, reject) => {
    const tracePath = traced
      ? path.join(traceDirectory, `${name}.json`)
      : undefined;
    const started = performance.now();
    const nodeOptions = [
      environment.env.NODE_OPTIONS,
      traced ? `--import=${traceModule}` : undefined,
    ]
      .filter(Boolean)
      .join(' ');
    execFile(
      process.execPath,
      [cliPath, ...args],
      {
        cwd: environment.cwd,
        env: {
          ...environment.env,
          NODE_OPTIONS: nodeOptions,
          NO_COLOR: '1',
          ...(traced ? { LINC_BENCHMARK_TRACE_FILE: tracePath } : {}),
        },
        maxBuffer: 4 * 1024 * 1024,
      },
      async (error, stdout, stderr) => {
        const elapsedMs = performance.now() - started;
        try {
          const trace = traced ? await readTrace(tracePath) : null;
          if (error) {
            reject(
              new Error(
                `${path.basename(cliPath)} failed: ${stderr || stdout}`,
              ),
            );
            return;
          }
          resolveRun({
            elapsedMs,
            stdout,
            trace,
            stdoutInfo: stdoutInfo(stdout),
          });
        } catch (traceError) {
          reject(error ?? traceError);
        }
      },
    );
  });
}

function measuredResult(result, trace) {
  return {
    elapsedMs: Math.round(result.elapsedMs * 1000) / 1000,
    stdout: result.stdoutInfo,
    http: trace,
  };
}

function summarize(samples, label) {
  const valuesMs = samples
    .map((sample) => sample[label].elapsedMs)
    .sort((a, b) => a - b);
  const middle = Math.floor(valuesMs.length / 2);
  return {
    medianMs:
      valuesMs.length % 2
        ? valuesMs[middle]
        : (valuesMs[middle - 1] + valuesMs[middle]) / 2,
    p95Ms: valuesMs[Math.max(0, Math.ceil(valuesMs.length * 0.95) - 1)],
  };
}

export async function runWorkload(workload, options) {
  const samples = [];
  for (let trial = 0; trial < options.trials; trial += 1) {
    const prepared = await workload.prepareTrial(trial);
    const order = trial % 2 === 0 ? ['before', 'after'] : ['after', 'before'];
    const results = {};
    for (const variant of order) {
      results[variant] = await runCli(
        options.paths[variant],
        prepared.args[variant],
        options.environment,
        options.traceDirectory,
        `${workload.name}-${trial + 1}-${variant}`,
        false,
      );
    }
    const traces = {};
    if (options.trace)
      for (const variant of order) {
        const traced = await runCli(
          options.paths[variant],
          prepared.traceArgs[variant],
          options.environment,
          options.traceDirectory,
          `${workload.name}-${trial + 1}-${variant}-trace`,
          true,
        );
        traces[variant] = traced.trace;
      }
    const verification = await prepared.verify(results);
    samples.push({
      trial: trial + 1,
      order,
      before: measuredResult(results.before, traces.before),
      after: measuredResult(results.after, traces.after),
      verification,
    });
    process.stdout.write(
      `${JSON.stringify({ workload: workload.name, trial: trial + 1, order })}\n`,
    );
  }
  const before = summarize(samples, 'before');
  const after = summarize(samples, 'after');
  return {
    name: workload.name,
    command: workload.command,
    samples,
    summary: {
      before,
      after,
      ratioOfMedians: before.medianMs / after.medianMs,
      ratioOfP95: before.p95Ms / after.p95Ms,
    },
  };
}

export async function sourceBaseline() {
  const execute = (command, args) =>
    new Promise((resolveRun, reject) => {
      execFile(command, args, { cwd: repositoryRoot }, (error, stdout) => {
        if (error) reject(error);
        else resolveRun(stdout.trim());
      });
    });
  const [commit, status] = await Promise.all([
    execute('git', ['rev-parse', 'HEAD']),
    execute('git', ['status', '--porcelain']),
  ]);
  return { gitCommit: commit, workingTree: status ? 'dirty' : 'clean' };
}

export async function resolveCli(sourcePath) {
  const resolved = await realpath(path.resolve(repositoryRoot, sourcePath));
  assert.equal(path.dirname(resolved), path.join(repositoryRoot, 'dist/cli'));
  return resolved;
}

export { describeCli };

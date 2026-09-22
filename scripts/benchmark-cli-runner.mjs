import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

function percentile(sorted, fraction) {
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index];
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
  return {
    medianMs: round(median),
    p95Ms: round(percentile(sorted, 0.95)),
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function runCli(cliPath, args, environment) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const started = performance.now();
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: environment.cwd,
      env: environment.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      const elapsedMs = performance.now() - started;
      if (code !== 0) {
        reject(
          new Error(
            `${cliPath} exited with ${code ?? signal}: ${stderr || stdout}`,
          ),
        );
        return;
      }
      resolve({ elapsedMs, stdout, stderr });
    });
  });
}

async function runTrial(workload, trial, clis, environment) {
  const prepared = await workload.prepareTrial(trial);
  const order = trial % 2 === 0 ? ['before', 'after'] : ['after', 'before'];
  const argsByCli = Array.isArray(prepared.args)
    ? { before: [...prepared.args], after: [...prepared.args] }
    : prepared.args;
  const results = {};
  for (const label of order) {
    results[label] = await runCli(clis[label], argsByCli[label], environment);
  }
  await prepared.verify(results);
  return {
    trial: trial + 1,
    order,
    beforeMs: round(results.before.elapsedMs),
    afterMs: round(results.after.elapsedMs),
  };
}

export async function benchmarkWorkloads({
  workloads,
  trials,
  clis,
  environment,
}) {
  const reports = [];
  for (const workload of workloads) {
    const samples = [];
    for (let trial = 0; trial < trials; trial += 1) {
      samples.push(await runTrial(workload, trial, clis, environment));
    }
    const before = summarize(samples.map((sample) => sample.beforeMs));
    const after = summarize(samples.map((sample) => sample.afterMs));
    reports.push({
      name: workload.name,
      command: workload.command,
      samples,
      summary: {
        before,
        after,
        ratioOfMedians: round(before.medianMs / after.medianMs),
        ratioOfP95: round(before.p95Ms / after.p95Ms),
      },
    });
  }
  return reports;
}

export async function describeCli(cliPath, sourcePath) {
  const contents = await readFile(cliPath);
  return {
    sourcePath,
    resolvedPath: cliPath,
    bytes: contents.byteLength,
    sha256: createHash('sha256').update(contents).digest('hex'),
  };
}

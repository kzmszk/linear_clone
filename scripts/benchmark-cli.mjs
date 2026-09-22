import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { api, seed, startRuntime } from '../tests/runtime.mjs';
import { createBenchmarkWorkloads } from './benchmark-cli-fixture.mjs';
import { benchmarkWorkloads, describeCli } from './benchmark-cli-runner.mjs';

const execute = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '..');
const usage = `Usage: node scripts/benchmark-cli.mjs \\
  --before dist/cli/linc-before.mjs \\
  --after dist/cli/linc.mjs \\
  --output artifacts/private/cli-benchmark.json [--trials 10]`;

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined)
      throw new Error(`${usage}\nEvery option requires a value.`);
    if (values.has(name)) throw new Error(`Option repeated: ${name}`);
    values.set(name, value);
  }
  const allowed = new Set(['--before', '--after', '--output', '--trials']);
  const unknown = [...values.keys()].find((name) => !allowed.has(name));
  if (unknown) throw new Error(`Unknown option: ${unknown}\n${usage}`);
  for (const required of ['--before', '--after', '--output']) {
    if (!values.has(required))
      throw new Error(`Missing ${required}.\n${usage}`);
  }
  const trials = Number(values.get('--trials') ?? '10');
  if (!Number.isInteger(trials) || trials < 1)
    throw new Error('--trials must be a positive integer.');
  return {
    before: values.get('--before'),
    after: values.get('--after'),
    output: values.get('--output'),
    trials,
  };
}

async function resolveCli(sourcePath, cliDirectory) {
  const resolvedPath = await realpath(path.resolve(repositoryRoot, sourcePath));
  assert.equal(
    path.dirname(resolvedPath),
    cliDirectory,
    `CLI artifacts must be direct children of ${cliDirectory}`,
  );
  return resolvedPath;
}

async function sourceBaseline() {
  const [{ stdout: commit }, { stdout: status }] = await Promise.all([
    execute('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot }),
    execute('git', ['status', '--porcelain'], { cwd: repositoryRoot }),
  ]);
  return {
    gitCommit: commit.trim(),
    workingTree: status.trim() ? 'dirty' : 'clean',
  };
}

async function buildReport(options, paths, workloads, environment) {
  const [baseline, before, after] = await Promise.all([
    sourceBaseline(),
    describeCli(paths.before, options.before),
    describeCli(paths.after, options.after),
  ]);
  const workloadReports = await benchmarkWorkloads({
    workloads,
    trials: options.trials,
    clis: paths,
    environment,
  });
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    timingBoundary:
      'performance.now() immediately before spawn() through the child close event; output parsing and API verification are excluded',
    environment: {
      node: process.version,
      nodeBinary: process.execPath,
      platform: os.platform(),
      release: os.release(),
      architecture: os.arch(),
    },
    sourceBaseline: baseline,
    artifacts: { before, after },
    trialsPerWorkload: options.trials,
    workloads: workloadReports,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const cliDirectory = await realpath(path.join(repositoryRoot, 'dist/cli'));
  const paths = {
    before: await resolveCli(options.before, cliDirectory),
    after: await resolveCli(options.after, cliDirectory),
  };
  const configDirectory = await mkdtemp(path.join(os.tmpdir(), 'linc-bench-'));
  const runtime = await startRuntime(8915);
  try {
    const request = api(runtime.url);
    const fixture = await seed(request);
    const workloads = await createBenchmarkWorkloads(
      request,
      fixture,
      runtime.url,
    );
    const report = await buildReport(options, paths, workloads, {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        LINC_CONFIG: path.join(configDirectory, 'config.json'),
      },
    });
    const outputPath = path.resolve(repositoryRoot, options.output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${outputPath}\n`);
  } finally {
    await runtime.stop();
    await rm(configDirectory, { recursive: true, force: true });
  }
}

await main();

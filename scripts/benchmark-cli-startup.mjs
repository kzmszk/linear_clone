import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { benchmarkWorkloads, describeCli } from './benchmark-cli-runner.mjs';

const { values } = parseArgs({
  options: {
    before: { type: 'string' },
    after: { type: 'string' },
    output: { type: 'string' },
    trials: { type: 'string', default: '30' },
  },
});
for (const key of ['before', 'after', 'output'])
  assert.ok(values[key], `Missing --${key}`);
const trials = Number(values.trials);
assert.ok(Number.isInteger(trials) && trials > 0, '--trials must be positive');
const clis = { before: resolve(values.before), after: resolve(values.after) };
const workloads = [
  ['root-help', ['--help']],
  ['issue-help', ['issue', '--help']],
  ['issue-create-help', ['issue', 'create', '--help']],
  ['import-help', ['import', 'linear', '--help']],
].map(([name, args]) => ({
  name,
  command: args,
  async prepareTrial() {
    return {
      args,
      async verify(results) {
        assert.equal(results.after.stdout, results.before.stdout);
        assert.equal(results.before.stderr, '');
        assert.equal(results.after.stderr, '');
        assert.match(results.after.stdout, /Usage: linc/u);
      },
    };
  },
}));
const report = {
  capturedAt: new Date().toISOString(),
  node: process.version,
  nodeBinary: process.execPath,
  timingBoundary: 'spawn through child close; verification excluded',
  trialsPerWorkload: trials,
  artifacts: {
    before: await describeCli(clis.before, values.before),
    after: await describeCli(clis.after, values.after),
  },
  workloads: await benchmarkWorkloads({
    workloads,
    trials,
    clis,
    environment: { env: process.env },
  }),
};
await mkdir(dirname(resolve(values.output)), { recursive: true });
await writeFile(values.output, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${values.output}\n`);

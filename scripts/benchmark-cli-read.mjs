import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { platform, release, arch } from 'node:os';
import { parseArgs } from 'node:util';
import { benchmarkWorkloads, describeCli } from './benchmark-cli-runner.mjs';

const { values } = parseArgs({
  options: {
    before: { type: 'string' },
    after: { type: 'string' },
    url: { type: 'string' },
    workspace: { type: 'string' },
    'workspace-id': { type: 'string' },
    issue: { type: 'string' },
    project: { type: 'string' },
    output: { type: 'string' },
    trials: { type: 'string', default: '20' },
  },
});
for (const key of [
  'before',
  'after',
  'url',
  'workspace',
  'workspace-id',
  'issue',
  'project',
  'output',
])
  assert.ok(values[key], `Missing --${key}`);
const trials = Number(values.trials);
assert.ok(Number.isInteger(trials) && trials > 0, '--trials must be positive');
const workloads = [];
for (const [scopeName, workspace] of [
  ['slug', values.workspace],
  ['id', values['workspace-id']],
]) {
  for (const [name, args] of [
    ['get', ['issue', 'get', values.issue]],
    ['project-filtered-list', ['issue', 'list', '--project', values.project]],
  ]) {
    workloads.push({
      name: `${name}-workspace-${scopeName}`,
      command: [
        '--url',
        values.url,
        '--workspace',
        workspace,
        '--json',
        ...args,
      ],
      async prepareTrial() {
        return {
          args: this.command,
          async verify(results) {
            const before = JSON.parse(results.before.stdout);
            const after = JSON.parse(results.after.stdout);
            assert.deepEqual(after, before);
            if (name === 'get') assert.equal(before.identifier, values.issue);
            else {
              assert.ok(Array.isArray(before));
              assert.ok(
                before.length > 0,
                'Choose a project with issues for this benchmark',
              );
              assert.ok(
                before.every((issue) => issue.projectId === values.project),
              );
            }
          },
        };
      },
    });
  }
}
const paths = { before: resolve(values.before), after: resolve(values.after) };
const reports = await benchmarkWorkloads({
  workloads,
  trials,
  clis: paths,
  environment: { cwd: process.cwd(), env: process.env },
});
const report = {
  capturedAt: new Date().toISOString(),
  target: values.url,
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    architecture: arch(),
  },
  timingBoundary:
    'Uninstrumented process spawn through close. JSON equality verification excluded. Before/after alternate order in each workload.',
  trialsPerVariant: trials,
  artifacts: {
    before: await describeCli(paths.before, values.before),
    after: await describeCli(paths.after, values.after),
  },
  workloads: reports,
};
await mkdir(dirname(resolve(values.output)), { recursive: true });
await writeFile(values.output, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(
  JSON.stringify(reports.map(({ name, summary }) => ({ name, summary }))) +
    '\n',
);

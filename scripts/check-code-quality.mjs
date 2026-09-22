import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const output = resolve(process.argv[2] ?? 'artifacts/private/quality/current');
mkdirSync(output, { recursive: true });
run('node', ['scripts/quality-metrics.mjs', output]);
run('pnpm', ['exec', 'jscpd', '--config', '.jscpd.json', '--output', output]);
const unused = run('pnpm', ['exec', 'knip', '--reporter', 'json'], true);
writeJson('unused.json', JSON.parse(unused));
console.log(`Knip findings: ${unused.trim()}`);
const duplicates = JSON.parse(
  readFileSync(`${output}/jscpd-report.json`, 'utf8'),
);
delete duplicates.statistics.detectionDate;
for (const clone of duplicates.duplicates) {
  for (const key of ['firstFile', 'secondFile']) {
    clone[key].name = relative(process.cwd(), clone[key].name);
  }
  delete clone.fragment;
}
writeJson('jscpd-report.json', duplicates);
console.log(`Quality reports: ${relative(process.cwd(), output)}`);

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (
    result.status === null ||
    (result.status !== 0 && (!capture || result.status !== 1))
  ) {
    throw new Error(`${command} failed: ${result.stderr ?? result.status}`);
  }
  if (result.status !== 0) process.exitCode = result.status;
  if (capture && result.stderr) process.stderr.write(result.stderr);
  return result.stdout;
}

function writeJson(name, value) {
  writeFileSync(`${output}/${name}`, JSON.stringify(value, null, 2) + '\n');
}

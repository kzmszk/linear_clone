import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  rm,
} from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const project = process.cwd();
const directory = await mkdtemp(path.join(tmpdir(), 'linc-hooks-'));
function run(command, args) {
  return spawnSync(command, args, {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, pnpm_config_verify_deps_before_run: 'false' },
  });
}
function succeeds(command, args) {
  const result = run(command, args);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
try {
  succeeds('git', ['init', '--quiet']);
  succeeds('git', ['config', 'user.name', 'Hook verification']);
  succeeds('git', ['config', 'user.email', 'hooks@example.test']);
  await symlink(
    path.join(project, 'node_modules'),
    path.join(directory, 'node_modules'),
    'dir',
  );
  const source = JSON.parse(await readFile('package.json', 'utf8'));
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      private: true,
      scripts: { typecheck: 'tsc --noEmit' },
      'lint-staged': source['lint-staged'],
    }),
  );
  await writeFile(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, types: [], skipLibCheck: true },
      include: ['sample.ts'],
    }),
  );
  await writeFile(path.join(directory, '.gitignore'), 'node_modules\n');
  await mkdir(path.join(directory, '.husky'));
  await writeFile(
    path.join(directory, '.husky/pre-commit'),
    await readFile('.husky/pre-commit'),
  );
  succeeds('node', [path.join(project, 'node_modules/husky/bin.js')]);
  await writeFile(
    path.join(directory, 'sample.ts'),
    'export const count: number = 1;\n',
  );
  succeeds('git', ['add', '.']);
  succeeds('git', ['commit', '-m', 'Valid fixture']);
  await writeFile(
    path.join(directory, 'sample.ts'),
    "export const count: number = 'invalid';\n",
  );
  succeeds('git', ['add', 'sample.ts']);
  const typecheck = run('node', [
    path.join(project, 'node_modules/typescript/bin/tsc'),
    '--noEmit',
  ]);
  assert.equal(typecheck.status, 2);

  const failed = run('git', ['commit', '-m', 'Must be rejected']);
  assert.notEqual(failed.status, 0, 'Hook accepted invalid TypeScript');
  assert.equal(run('git', ['rev-list', '--count', 'HEAD']).stdout.trim(), '1');
  process.stdout.write(
    'Verified: valid commit accepted; invalid TypeScript commit rejected.\n',
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}

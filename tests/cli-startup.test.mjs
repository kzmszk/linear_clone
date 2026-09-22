import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

function runCli(directory, name, args, env = process.env) {
  const stdoutPath = join(directory, `${name}.stdout`);
  const stderrPath = join(directory, `${name}.stderr`);
  const stdout = openSync(stdoutPath, 'w');
  const stderr = openSync(stderrPath, 'w');
  let result;
  try {
    result = spawnSync(process.execPath, ['dist/cli/linc.mjs', ...args], {
      env,
      stdio: ['ignore', stdout, stderr],
    });
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
  assert.ifError(result.error);
  return {
    code: result.status,
    stdout: readFileSync(stdoutPath, 'utf8'),
    stderr: readFileSync(stderrPath, 'utf8'),
  };
}

test('built CLI prints root and subcommand help', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'linc-help-'));
  try {
    const root = runCli(directory, 'root', ['--help']);
    const issue = runCli(directory, 'issue', ['issue', '--help']);
    assert.equal(root.code, 0);
    assert.equal(issue.code, 0);
    assert.match(root.stdout, /Usage: linc \[options\] \[command\]/u);
    assert.match(root.stdout, /issue/u);
    assert.match(issue.stdout, /Usage: linc issue \[options\] \[command\]/u);
    assert.match(issue.stdout, /create/u);
    assert.equal(root.stderr, '');
    assert.equal(issue.stderr, '');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('built CLI reports config validation errors in English', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'linc-config-error-'));
  const configPath = join(directory, 'config.json');
  const environment = { ...process.env, LINC_CONFIG: configPath };
  delete environment.LINC_URL;

  try {
    await writeFile(
      configPath,
      JSON.stringify({ profiles: {}, defaultUrl: 'not a URL' }),
    );
    const result = runCli(
      directory,
      'config-error',
      ['--json', 'workspace', 'list'],
      environment,
    );
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    const payload = JSON.parse(result.stderr);
    assert.equal(payload.error.code, 'cli_error');
    assert.match(payload.error.message, /Invalid URL/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

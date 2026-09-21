import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const bundle = await readFile('dist/worker/index.js', 'utf8');
for (const marker of [
  'x-test-email',
  'x-test-subject',
  'authenticateLocal',
  'owner@example.test',
]) {
  assert.equal(
    bundle.includes(marker),
    false,
    `Production bundle contains local authentication: ${marker}`,
  );
}
process.stdout.write('Production bundle excludes local authentication.\n');

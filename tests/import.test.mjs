import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { api, seed, startRuntime } from './runtime.mjs';
import { writeImportFixture } from './import-fixture.mjs';

const execute = promisify(execFile);

test('CLI verification rejects an export with changed source bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'linc-verify-test-'));
  try {
    const source = await writeImportFixture(directory);
    const args = [
      'dist/cli/linc.mjs',
      '--json',
      'import',
      'linear',
      'verify',
      '--local-only',
      directory,
    ];
    const valid = await execute(process.execPath, args);
    assert.equal(JSON.parse(valid.stdout).ok, true);
    const recordPath = join(directory, source.manifest.records[0].rawFile);
    const record = JSON.parse(await readFile(recordPath, 'utf8'));
    await writeFile(
      recordPath,
      JSON.stringify({ ...record, name: 'Changed source' }),
    );
    await assert.rejects(execute(process.execPath, args), (error) => {
      assert.equal(error.code, 1);
      const report = JSON.parse(error.stdout);
      assert.equal(report.ok, false);
      assert.equal(report.mismatches.length, 1);
      return true;
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI import preserves source issue content, hierarchy, authors and dates without granting login membership', async () => {
  const runtime = await startRuntime(8904);
  const directory = await mkdtemp(join(tmpdir(), 'linc-import-test-'));
  try {
    const request = api(runtime.url);
    const target = await seed(request);
    const source = await writeImportFixture(directory);
    const args = [
      'dist/cli/linc.mjs',
      '--url',
      runtime.url,
      '--workspace',
      target.workspaceId,
      '--json',
      'import',
      'linear',
      'apply',
      directory,
    ];
    await execute(process.execPath, args);
    const archived = await request(`${target.base}/issues?archived=true`);
    assert.equal(archived.body.items.length, 1);
    const child = archived.body.items[0];
    assert.equal(child.identifier, 'LIN-42');
    assert.equal(child.description, '## 原本\n\n- [x] **Keep Markdown**');
    assert.equal(child.createdAt, '2024-02-01T03:04:05.000Z');
    assert.equal(child.updatedAt, '2024-02-02T03:04:05.000Z');
    assert.equal(child.completedAt, '2024-02-02T03:04:05.000Z');
    assert.equal(child.assigneeName, 'Original Author');
    assert.equal(child.sourceId, source.ids.child);
    const parents = await request(`${target.base}/issues`);
    assert.equal(parents.body.items.length, 1);
    assert.equal(child.parentId, parents.body.items[0].id);
    const metadata = (await request(`${target.base}/metadata`)).body;
    assertImportedMetadata(metadata, child);
    const comments = (
      await request(`${target.base}/issues/${child.id}/comments`)
    ).body;
    assert.equal(comments.length, 2);
    const original = comments.find(
      (comment) => comment.body === 'Original comment',
    );
    const reply = comments.find((comment) => comment.body === 'Original reply');
    assert.equal(original.authorName, 'Original Author');
    assert.equal(original.createdAt, '2024-02-01T03:04:05.000Z');
    assert.equal(reply.parentCommentId, original.id);
    const attachments = (
      await request(`${target.base}/issues/${child.id}/attachments`)
    ).body;
    assert.equal(attachments[0].title, 'Original pull request');
    assert.equal(
      attachments[0].url,
      'https://github.com/example/project/pull/42',
    );
    await assertRelatedIssue(
      request,
      target.base,
      child,
      parents.body.items[0],
    );
    const edit = await request(`${target.base}/issues/${child.id}`, {
      method: 'PATCH',
      body: { title: 'Locally edited', expectedVersion: 1 },
    });
    assert.equal(edit.status, 200, JSON.stringify(edit));
    await execute(process.execPath, args);
    const afterReplay = await request(`${target.base}/issues/${child.id}`);
    assert.equal(afterReplay.body.title, 'Locally edited');
    assert.equal(
      (await request(`${target.base}/issues?archived=true`)).body.items.length,
      1,
    );
  } catch (error) {
    await delay(300);
    throw new Error(runtime.output(), { cause: error });
  } finally {
    await runtime.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

function assertImportedMetadata(metadata, child) {
  assert.equal(
    metadata.states.find((state) => state.id === child.stateId).name,
    'Released',
  );
  assert.equal(
    metadata.labels.find((label) => label.id === child.labelIds[0]).name,
    'Feature',
  );
  assert.equal(metadata.members.length, 1);
}

async function assertRelatedIssue(request, base, child, parent) {
  const outgoing = (await request(`${base}/issues/${child.id}/relations`)).body;
  assert.equal(outgoing[0].issueId, parent.id);
  assert.equal(outgoing[0].type, 'blocks');
  assert.equal(outgoing[0].direction, 'outgoing');
  const incoming = (await request(`${base}/issues/${parent.id}/relations`))
    .body;
  assert.equal(incoming[0].issueId, child.id);
  assert.equal(incoming[0].direction, 'incoming');
}

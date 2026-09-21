import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ids = Object.fromEntries(
  [
    'team',
    'state',
    'project',
    'member',
    'label',
    'parent',
    'child',
    'comment',
    'reply',
    'history',
    'attachment',
    'relation',
  ].map((kind) => [kind, randomUUID()]),
);
const createdAt = '2024-02-01T03:04:05.000Z';
const updatedAt = '2024-02-02T03:04:05.000Z';
const ref = (kind) => ({ id: ids[kind] });
const actor = {
  ...ref('member'),
  name: 'Original Author',
  email: 'source@example.test',
};
const issue = {
  title: 'Imported child',
  number: 42,
  identifier: 'LIN-42',
  description: '## 原本\n\n- [x] **Keep Markdown**',
  descriptionState: '{"type":"doc"}',
  createdAt,
  updatedAt,
  archivedAt: '2024-03-01T00:00:00.000Z',
  completedAt: updatedAt,
  canceledAt: null,
  state: ref('state'),
  team: ref('team'),
  project: ref('project'),
  assignee: actor,
  creator: actor,
  priority: 2,
  estimate: 3,
  dueDate: '2024-03-10',
  labels: { nodes: [ref('label')] },
  parent: ref('parent'),
};
const entries = [
  [
    'team',
    {
      ...ref('team'),
      key: 'LIN',
      name: 'Imported team',
      private: false,
      createdAt,
      updatedAt,
    },
  ],
  [
    'state',
    {
      ...ref('state'),
      team: ref('team'),
      name: 'Released',
      type: 'completed',
      color: '#00ff00',
      position: 2,
    },
  ],
  ['member', actor],
  [
    'relation',
    {
      ...ref('relation'),
      issue: ref('child'),
      relatedIssue: ref('parent'),
      type: 'blocks',
      createdAt,
      updatedAt,
    },
  ],
  [
    'attachment',
    {
      ...ref('attachment'),
      issueId: ids.child,
      title: 'Original pull request',
      url: 'https://github.com/example/project/pull/42',
      createdAt,
      updatedAt,
    },
  ],
  [
    'project',
    {
      ...ref('project'),
      name: 'Original project',
      description: 'Original project description',
      status: { name: 'Completed', type: 'completed' },
      teams: { nodes: [ref('team')] },
      createdAt,
      updatedAt,
    },
  ],
  ['label', { ...ref('label'), name: 'Feature', color: '#888888' }],
  ['issue', { ...issue, ...ref('child') }],
  [
    'issue',
    {
      ...issue,
      ...ref('parent'),
      title: 'Imported parent',
      number: 41,
      identifier: 'LIN-41',
      parent: null,
      archivedAt: null,
    },
  ],
  [
    'comment',
    {
      ...ref('reply'),
      issueId: ids.child,
      parentId: ids.comment,
      body: 'Original reply',
      user: actor,
      createdAt,
      updatedAt,
    },
  ],
  [
    'comment',
    {
      ...ref('comment'),
      issueId: ids.child,
      parentId: null,
      body: 'Original comment',
      user: actor,
      createdAt,
      updatedAt,
    },
  ],
  [
    'history',
    {
      ...ref('history'),
      issueId: ids.child,
      actor,
      actorId: ids.member,
      createdAt,
      updatedAt,
      fromTitle: 'Old title',
      toTitle: 'Imported child',
      changes: { title: { from: 'Old title', to: 'Imported child' } },
    },
  ],
];
export async function writeImportFixture(directory) {
  const records = [];
  await mkdir(join(directory, 'records'), { recursive: true, mode: 0o700 });
  for (const [kind, payload] of entries) {
    const text = JSON.stringify(payload);
    const rawFile = `records/${payload.id}.json`;
    await writeFile(join(directory, rawFile), text, { mode: 0o600 });
    records.push({
      kind,
      sourceId: payload.id,
      sourceRevision: updatedAt,
      payloadHash: createHash('sha256').update(text).digest('hex'),
      rawFile,
    });
  }
  const manifest = {
    schemaVersion: 1,
    provider: 'linear',
    runId: randomUUID(),
    sourceWorkspaceId: randomUUID(),
    exportedAt: updatedAt,
    records,
    files: [],
    connections: [{ name: 'issues', status: 'complete', count: 2 }],
    missing: [],
  };
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest), {
    mode: 0o600,
  });
  return { ids, manifest, createdAt, updatedAt };
}

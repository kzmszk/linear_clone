import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    input: { type: 'string' },
    workspace: { type: 'string' },
    help: { type: 'boolean' },
  },
});

if (values.help) {
  process.stdout.write(
    'Usage: node scripts/inspect-linear.mjs [--workspace SLUG] [--input FILE]\n' +
      'Read Linear issues, including archives, and print aggregate counts only.\n' +
      '--input accepts the JSON array from linear api --paginate.\n',
  );
  process.exit(0);
}

const query = `query($after: String) {
  issues(first: 100, after: $after, includeArchived: true) {
    nodes {
      id archivedAt description estimate dueDate
      state { type }
      project { id }
      parent { id }
      labels(first: 100) { nodes { id } pageInfo { hasNextPage } }
      comments(first: 1) { nodes { id } }
      attachments(first: 1) { nodes { id } }
    }
    pageInfo { endCursor hasNextPage }
  }
}`;

try {
  let input;
  if (values.input) {
    input = readFileSync(values.input, 'utf8');
  } else {
    const args = ['api', '--paginate', query];
    if (values.workspace) args.push('--workspace', values.workspace);
    const result = spawnSync('linear', args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000,
    });
    if (result.error || result.status !== 0) {
      throw new Error(
        'Linear query failed. Check linear auth whoami and network access.',
      );
    }
    input = result.stdout;
  }

  const issues = JSON.parse(input);
  assert(Array.isArray(issues), 'Expected the paginated issue array');
  const projects = new Set();
  const ids = new Set();
  const counts = {
    issues: issues.length,
    archived: 0,
    referencedProjects: 0,
    issuesWithParent: 0,
    issuesWithComments: 0,
    issuesWithAttachmentMetadata: 0,
    issuesWithEstimate: 0,
    issuesWithDueDate: 0,
    descriptionBytes: 0,
    largestDescriptionBytes: 0,
    issuesWithInlineImages: 0,
    issuesWithLinearFileUrls: 0,
    issuesWithCollapsibleSections: 0,
    incompleteLabelPages: 0,
    stateTypes: {},
  };
  const states = new Map();
  for (const issue of issues) {
    assert.equal(typeof issue.id, 'string', 'Missing issue ID');
    assert(!ids.has(issue.id), 'Duplicate issue ID in pagination');
    ids.add(issue.id);
    assert(
      issue.description === null || typeof issue.description === 'string',
      'Invalid issue description',
    );
    const body = issue.description ?? '';
    const bytes = Buffer.byteLength(body);
    if (issue.archivedAt !== null) counts.archived++;
    if (issue.project) projects.add(issue.project.id);
    if (issue.parent) counts.issuesWithParent++;
    if (issue.comments.nodes.length) counts.issuesWithComments++;
    if (issue.attachments.nodes.length) counts.issuesWithAttachmentMetadata++;
    if (issue.estimate !== null) counts.issuesWithEstimate++;
    if (issue.dueDate !== null) counts.issuesWithDueDate++;
    counts.descriptionBytes += bytes;
    counts.largestDescriptionBytes = Math.max(
      counts.largestDescriptionBytes,
      bytes,
    );
    if (/!\[|<img/u.test(body)) counts.issuesWithInlineImages++;
    if (body.includes('uploads.linear.app')) counts.issuesWithLinearFileUrls++;
    if (body.includes('+++')) counts.issuesWithCollapsibleSections++;
    if (issue.labels.pageInfo.hasNextPage) counts.incompleteLabelPages++;
    assert.equal(typeof issue.state.type, 'string', 'Missing state type');
    states.set(issue.state.type, (states.get(issue.state.type) ?? 0) + 1);
  }
  counts.referencedProjects = projects.size;
  counts.stateTypes = Object.fromEntries(
    [...states].sort(([left], [right]) => left.localeCompare(right)),
  );
  process.stdout.write(`${JSON.stringify(counts, null, 2)}\n`);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Inventory failed'}\n`,
  );
  process.exitCode = 1;
}

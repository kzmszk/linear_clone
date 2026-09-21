import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ensurePrivateDir, writePrivateJson } from './files.ts';
import {
  addRecord,
  collectFiles,
  writeRecords,
  type StoredRecord,
} from './record-files.ts';
import {
  asRecord,
  stringValue,
  type Connection,
  type ExportOptions,
  type Manifest,
} from './model.ts';
import { collectIssueNested, collectNestedPages } from './nested-export.ts';
import { inlineAttachments } from './inline-files.ts';
import {
  collectionNodes,
  collectionPageInfo,
  hasGraphqlErrors,
  issuePageNodes,
  labelsQuery,
  nestedNodes,
  organizationQuery,
  projectsQuery,
  teamsQuery,
  issuesQuery,
  runLinearQuery,
  statesQuery,
  usersQuery,
  withoutData,
} from './linear.ts';

export async function exportLinear(options: ExportOptions): Promise<Manifest> {
  await ensurePrivateDir(options.outputDir);
  const records = new Map<string, StoredRecord>();
  const missing: string[] = [];
  const connections: Connection[] = [];
  const source = await loadSource(options, missing);
  const sourceWorkspaceId = source.id;
  const sourceWorkspaceName = source.name;

  await collectMetadata(options, records, connections, missing);
  const issues = await collectIssues(options, records, connections, missing);
  await collectNestedPages(options, issues, records, connections, missing);
  const files = await collectFiles(options, records, missing);
  const summaries = await writeRecords(options.outputDir, records);
  const manifest: Manifest = {
    schemaVersion: 1,
    provider: 'linear',
    runId: randomUUID(),
    sourceWorkspaceId,
    ...(sourceWorkspaceName ? { sourceWorkspaceName } : {}),
    exportedAt: new Date().toISOString(),
    records: summaries,
    files,
    connections,
    missing: [...new Set(missing)].sort(),
  };
  await writePrivateJson(join(options.outputDir, 'manifest.json'), manifest);
  return manifest;
}

async function loadSource(
  options: ExportOptions,
  missing: string[],
): Promise<{ id: string; name?: string }> {
  const organization = await runLinearQuery(organizationQuery, options);
  const errors = hasGraphqlErrors(organization);
  const organizationRecord = asRecord(
    asRecord(withoutData(organization))?.organization,
  );
  const id = stringValue(organizationRecord?.id) ?? options.workspace;
  if (!id)
    throw new Error(
      'Linear did not return an organization ID; pass --workspace so source records remain scoped.',
    );
  if (errors.length) missing.push(`organization: ${errors.join('; ')}`);
  const name = stringValue(organizationRecord?.name);
  return name ? { id, name } : { id };
}

async function collectIssues(
  options: ExportOptions,
  records: Map<string, StoredRecord>,
  connections: Connection[],
  missing: string[],
): Promise<unknown[]> {
  const output = await runLinearQuery(issuesQuery, options);
  const errors = hasGraphqlErrors(output);
  const issues = issuePageNodes(output);
  if (!issues.length && errors.length)
    throw new Error(`Linear issue query failed: ${errors.join('; ')}`);
  connections.push({
    name: 'issues',
    status: errors.length ? 'failed' : 'complete',
    count: issues.length,
    ...(errors.length ? { error: errors.join('; ') } : {}),
  });
  for (const issue of issues) collectIssue(records, issue, missing);
  return issues;
}

async function collectMetadata(
  options: ExportOptions,
  records: Map<string, StoredRecord>,
  connections: Connection[],
  missing: string[],
): Promise<void> {
  for (const [collection, kind, query] of [
    ['teams', 'team', teamsQuery],
    ['workflowStates', 'state', statesQuery],
    ['projects', 'project', projectsQuery],
    ['issueLabels', 'label', labelsQuery],
    ['users', 'member', usersQuery],
  ] as const)
    await collectMetadataCollection(
      options,
      records,
      connections,
      missing,
      collection,
      kind,
      query,
    );
}

async function collectMetadataCollection(
  options: ExportOptions,
  records: Map<string, StoredRecord>,
  connections: Connection[],
  missing: string[],
  collection: 'teams' | 'workflowStates' | 'projects' | 'issueLabels' | 'users',
  kind: 'team' | 'state' | 'project' | 'label' | 'member',
  query: string,
): Promise<void> {
  try {
    const output = await runLinearQuery(query, options);
    const errors = hasGraphqlErrors(output);
    const nodes = collectionNodes(output, collection);
    for (const node of nodes) addMetadataRecord(records, kind, node);
    const info = collectionPageInfo(output, collection);
    if (info.hasNextPage)
      missing.push(`${collection}: linear CLI did not finish pagination`);
    connections.push({
      name: collection,
      status: errors.length
        ? 'failed'
        : info.hasNextPage
          ? 'missing'
          : 'complete',
      count: nodes.length,
      ...(errors.length ? { error: errors.join('; ') } : {}),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `${collection} query failed`;
    connections.push({
      name: collection,
      status: 'failed',
      count: 0,
      error: message,
    });
    missing.push(`metadata ${collection}: ${message}`);
  }
}

function addMetadataRecord(
  records: Map<string, StoredRecord>,
  kind: 'team' | 'state' | 'project' | 'label' | 'member',
  payload: unknown,
): void {
  if (kind !== 'state') {
    addRecord(records, kind, payload);
    return;
  }
  const record = asRecord(payload);
  const team = asRecord(record?.team);
  addRecord(records, kind, team ? { ...record, teamId: team.id } : payload);
}

function collectIssue(
  records: Map<string, StoredRecord>,
  value: unknown,
  missing: string[],
): void {
  const issue = asRecord(value);
  if (!issue) {
    missing.push('issue: non-object record');
    return;
  }
  addRecord(records, 'issue', issue);
  collectIssueContext(records, issue);
  const issueId = stringValue(issue.id);
  if (issueId)
    for (const attachment of inlineAttachments(issue, issueId))
      addRecord(records, 'attachment', attachment, attachment.url);
  collectIssueNested(records, issue, missing);
}

function collectIssueContext(
  records: Map<string, StoredRecord>,
  issue: Record<string, unknown>,
): void {
  const team = asRecord(issue.team);
  const state = asRecord(issue.state);
  const project = asRecord(issue.project);
  if (team) addRecord(records, 'team', team);
  if (state)
    addRecord(
      records,
      'state',
      team ? { ...state, team, teamId: team.id } : state,
    );
  if (project) addRecord(records, 'project', project);
  for (const actorKey of ['creator', 'assignee']) {
    const actor = asRecord(issue[actorKey]);
    if (actor) addRecord(records, 'member', actor);
  }
  for (const label of nestedNodes(issue, 'labels'))
    addRecord(records, 'label', label);
}

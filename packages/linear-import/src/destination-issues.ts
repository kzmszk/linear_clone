import { issueSchema, type Issue } from '../../contracts/src/index.ts';
import { asRecord, type ImportTransport } from './model.ts';
import type { LoadedExport, LoadedRecord } from './plan.ts';
import type { Mapping } from './destination-schema.ts';
import {
  destinationId,
  compareProperty,
  mappingKey,
  messageOf,
  nestedIds,
  replaceSourceUrls,
  sourceName,
  sourceRef,
} from './destination-values.ts';

export async function verifyIssues(
  records: LoadedRecord[],
  loaded: LoadedExport,
  workspaceId: string,
  mappings: Map<string, Mapping>,
  replacements: Map<string, string>,
  transport: ImportTransport,
  mismatches: string[],
): Promise<Map<string, Issue>> {
  const targets = new Map<string, Issue>();
  for (const record of records) {
    const target = await fetchIssue(
      record,
      workspaceId,
      mappings,
      transport,
      mismatches,
    );
    if (!target) continue;
    targets.set(record.summary.sourceId, target);
    compareIssue(record, target, loaded, mappings, replacements, mismatches);
  }
  return targets;
}

async function fetchIssue(
  source: LoadedRecord,
  workspaceId: string,
  mappings: Map<string, Mapping>,
  transport: ImportTransport,
  mismatches: string[],
): Promise<Issue | undefined> {
  const mapping = mappings.get(
    mappingKey(
      source.summary.kind,
      source.summary.sourceId,
      source.summary.sourceRevision,
    ),
  );
  if (!mapping?.destinationId) return undefined;
  try {
    return await transport.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/issues/${encodeURIComponent(mapping.destinationId)}`,
      issueSchema,
    );
  } catch (error) {
    mismatches.push(
      `destination issue missing: ${source.summary.sourceId} (${messageOf(error)})`,
    );
    return undefined;
  }
}

function compareIssue(
  source: LoadedRecord,
  target: Issue,
  loaded: LoadedExport,
  mappings: Map<string, Mapping>,
  replacements: Map<string, string>,
  mismatches: string[],
): boolean {
  const payload = asRecord(source.payload);
  if (!payload) return false;
  return [
    compareIssueFields(source, payload, target, replacements, mismatches),
    compareIssueReferences(
      source,
      payload,
      target,
      loaded,
      mappings,
      mismatches,
    ),
    compareIssueLabels(source, payload, target, loaded, mappings, mismatches),
  ].every(Boolean);
}

function compareIssueFields(
  source: LoadedRecord,
  payload: Record<string, unknown>,
  target: Issue,
  replacements: Map<string, string>,
  mismatches: string[],
): boolean {
  let matches = true;
  for (const field of [
    'title',
    'description',
    'priority',
    'estimate',
    'dueDate',
    'createdAt',
    'updatedAt',
    'archivedAt',
    'deletedAt',
    'completedAt',
    'canceledAt',
  ] as const) {
    const expected =
      field === 'description' && typeof payload[field] === 'string'
        ? replaceSourceUrls(payload[field], replacements)
        : payload[field];
    matches =
      compareProperty(source, field, expected, target[field], mismatches) &&
      matches;
  }
  matches =
    compareProperty(
      source,
      'sourceId',
      source.summary.sourceId,
      target.sourceId,
      mismatches,
    ) && matches;
  const expectedAssignee = sourceName(payload, 'assignee');
  if (expectedAssignee !== undefined)
    matches =
      compareProperty(
        source,
        'assigneeName',
        expectedAssignee,
        target.assigneeName,
        mismatches,
      ) && matches;
  return matches;
}

function compareIssueReferences(
  source: LoadedRecord,
  payload: Record<string, unknown>,
  target: Issue,
  loaded: LoadedExport,
  mappings: Map<string, Mapping>,
  mismatches: string[],
): boolean {
  let matches = true;
  for (const [field, kind] of [
    ['team', 'team'],
    ['state', 'state'],
    ['project', 'project'],
    ['parent', 'issue'],
  ] as const) {
    const sourceId = sourceRef(payload, field);
    if (sourceId === undefined) continue;
    const expected =
      sourceId === null
        ? null
        : destinationId(loaded, mappings, kind, sourceId);
    if (expected !== undefined)
      matches =
        compareProperty(
          source,
          `${field}Id`,
          expected,
          target[`${field}Id` as keyof Issue],
          mismatches,
        ) && matches;
  }
  return matches;
}

function compareIssueLabels(
  source: LoadedRecord,
  payload: Record<string, unknown>,
  target: Issue,
  loaded: LoadedExport,
  mappings: Map<string, Mapping>,
  mismatches: string[],
): boolean {
  if (!('labels' in payload)) return true;
  const expected = nestedIds(payload, 'labels').map((id) =>
    destinationId(loaded, mappings, 'label', id),
  );
  if (!expected.every((id): id is string => id !== undefined)) return true;
  return compareProperty(
    source,
    'labelIds',
    expected.sort(),
    [...target.labelIds].sort(),
    mismatches,
  );
}

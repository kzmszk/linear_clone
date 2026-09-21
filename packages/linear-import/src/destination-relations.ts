import { z } from 'zod';
import { asRecord, stringValue, type ImportTransport } from './model.ts';
import type { LoadedExport, LoadedRecord } from './plan.ts';
import type { Mapping } from './destination-schema.ts';
import {
  destinationIdForSource,
  mappingKey,
  messageOf,
  sourceRef,
} from './destination-values.ts';

const relationSchema = z.object({
  id: z.string(),
  type: z.string(),
  issueId: z.string(),
  direction: z.enum(['incoming', 'outgoing']),
});
type Relation = z.infer<typeof relationSchema>;

export async function compareRelations(
  loaded: LoadedExport,
  mappings: Map<string, Mapping>,
  workspaceId: string,
  transport: ImportTransport,
  mismatches: string[],
): Promise<boolean> {
  const relations = loaded.records.filter(
    (record) => record.summary.kind === 'relation',
  );
  const groups = relationGroups(relations);
  let matches = true;
  for (const [sourceIssueId, group] of groups) {
    const destinationIssueId = destinationIdForSource(
      mappings,
      'issue',
      sourceIssueId,
    );
    if (!destinationIssueId) {
      mismatches.push(`relation source issue missing: ${sourceIssueId}`);
      matches = false;
      continue;
    }
    const actual = await fetchRelations(
      workspaceId,
      destinationIssueId,
      transport,
      mismatches,
    );
    if (!actual) {
      matches = false;
      continue;
    }
    for (const record of group) {
      if (!compareRelation(record, actual, sourceIssueId, mappings, mismatches))
        matches = false;
    }
  }
  return matches;
}

function relationGroups(records: LoadedRecord[]): Map<string, LoadedRecord[]> {
  const groups = new Map<string, LoadedRecord[]>();
  for (const record of records) {
    const issueId = relationIssueId(record.payload);
    if (issueId) groups.set(issueId, [...(groups.get(issueId) ?? []), record]);
  }
  return groups;
}

async function fetchRelations(
  workspaceId: string,
  issueId: string,
  transport: ImportTransport,
  mismatches: string[],
): Promise<Relation[] | undefined> {
  try {
    return await transport.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/issues/${encodeURIComponent(issueId)}/relations`,
      z.array(relationSchema),
    );
  } catch (error) {
    mismatches.push(`destination relation request failed: ${messageOf(error)}`);
    return undefined;
  }
}

function compareRelation(
  source: LoadedRecord,
  actual: Relation[],
  sourceIssueId: string,
  mappings: Map<string, Mapping>,
  mismatches: string[],
): boolean {
  const mapping = mappings.get(
    mappingKey(
      'relation',
      source.summary.sourceId,
      source.summary.sourceRevision,
    ),
  );
  const relation = actual.find((value) => value.id === mapping?.destinationId);
  if (!relation) {
    mismatches.push(`destination relation missing: ${source.summary.sourceId}`);
    return false;
  }
  const payload = asRecord(source.payload);
  const expectedTarget = sourceRef(payload, 'relatedIssue');
  const targetId = expectedTarget
    ? destinationIdForSource(mappings, 'issue', expectedTarget)
    : null;
  const expectedType = stringValue(payload?.type);
  const expectedDirection =
    relationIssueId(source.payload) === sourceIssueId ? 'outgoing' : 'incoming';
  let matches = true;
  if (expectedType !== undefined && relation.type !== expectedType) {
    mismatches.push(
      `destination relation type differs: ${source.summary.sourceId}`,
    );
    matches = false;
  }
  if (targetId && relation.issueId !== targetId) {
    mismatches.push(
      `destination relation target differs: ${source.summary.sourceId}`,
    );
    matches = false;
  }
  if (relation.direction !== expectedDirection) {
    mismatches.push(
      `destination relation direction differs: ${source.summary.sourceId}`,
    );
    matches = false;
  }
  return matches;
}

function relationIssueId(payload: unknown): string | null {
  const record = asRecord(payload);
  return stringValue(record?.issueId) ?? sourceRef(record, 'issue') ?? null;
}

import { z } from 'zod';
import {
  activitySchema,
  commentSchema,
  type Comment,
  type Issue,
} from '../../contracts/src/index.ts';
import { asRecord, stringValue, type ImportTransport } from './model.ts';
import type { LoadedRecord } from './plan.ts';
import type { Mapping } from './destination-schema.ts';
import {
  compareProperty,
  destinationIdForSource,
  historyAction,
  mappingKey,
  messageOf,
  replaceSourceUrls,
  sourceName,
  sourceRef,
} from './destination-values.ts';

type Activity = z.infer<typeof activitySchema>;

export async function compareComments(
  records: LoadedRecord[],
  targets: Map<string, Issue>,
  mappings: Map<string, Mapping>,
  replacements: Map<string, string>,
  workspaceId: string,
  transport: ImportTransport,
  mismatches: string[],
): Promise<boolean> {
  return compareIssueChildren(
    records,
    targets,
    mappings,
    replacements,
    workspaceId,
    transport,
    mismatches,
    'comment',
  );
}

export async function compareHistories(
  records: LoadedRecord[],
  targets: Map<string, Issue>,
  mappings: Map<string, Mapping>,
  replacements: Map<string, string>,
  workspaceId: string,
  transport: ImportTransport,
  mismatches: string[],
): Promise<boolean> {
  return compareIssueChildren(
    records,
    targets,
    mappings,
    replacements,
    workspaceId,
    transport,
    mismatches,
    'history',
  );
}

async function compareIssueChildren(
  records: LoadedRecord[],
  targets: Map<string, Issue>,
  mappings: Map<string, Mapping>,
  replacements: Map<string, string>,
  workspaceId: string,
  transport: ImportTransport,
  mismatches: string[],
  kind: 'comment' | 'history',
): Promise<boolean> {
  const groups = new Map<string, LoadedRecord[]>();
  for (const record of records) {
    const issueId = sourceRef(asRecord(record.payload), 'issue');
    if (issueId) groups.set(issueId, [...(groups.get(issueId) ?? []), record]);
  }
  let matches = true;
  for (const [sourceIssueId, group] of groups) {
    const issue = targets.get(sourceIssueId);
    if (!issue) {
      mismatches.push(
        `${kind} records reference missing issue ${sourceIssueId}`,
      );
      matches = false;
      continue;
    }
    const actual = await fetchChildren(
      kind,
      workspaceId,
      issue.id,
      transport,
      mismatches,
    );
    if (!actual) {
      matches = false;
      continue;
    }
    for (const record of group) {
      const mapping = mappings.get(
        mappingKey(
          kind,
          record.summary.sourceId,
          record.summary.sourceRevision,
        ),
      );
      const destination = mapping?.destinationId;
      const child = actual.find((value) => value.id === destination);
      if (
        !child ||
        !compareChild(
          record,
          child,
          kind,
          mappings,
          targets,
          replacements,
          mismatches,
        )
      )
        matches = false;
    }
  }
  return matches;
}

async function fetchChildren(
  kind: 'comment' | 'history',
  workspaceId: string,
  issueId: string,
  transport: ImportTransport,
  mismatches: string[],
): Promise<(Comment | Activity)[] | undefined> {
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/issues/${encodeURIComponent(issueId)}/${kind === 'comment' ? 'comments' : 'activity'}`;
  try {
    return await transport.request(
      path,
      z.array(kind === 'comment' ? commentSchema : activitySchema),
    );
  } catch (error) {
    mismatches.push(`destination ${kind} request failed: ${messageOf(error)}`);
    return undefined;
  }
}

function compareChild(
  source: LoadedRecord,
  child: Comment | Activity,
  kind: 'comment' | 'history',
  mappings: Map<string, Mapping>,
  targets: Map<string, Issue>,
  replacements: Map<string, string>,
  mismatches: string[],
): boolean {
  const payload = asRecord(source.payload);
  if (!payload) return false;
  return kind === 'comment'
    ? compareComment(
        source,
        payload,
        child as Comment,
        mappings,
        targets,
        replacements,
        mismatches,
      )
    : compareActivity(source, payload, child as Activity, mismatches);
}

function compareComment(
  source: LoadedRecord,
  payload: Record<string, unknown>,
  comment: Comment,
  mappings: Map<string, Mapping>,
  targets: Map<string, Issue>,
  replacements: Map<string, string>,
  mismatches: string[],
): boolean {
  return [
    compareCommentValues(source, payload, comment, replacements, mismatches),
    compareCommentReferences(
      source,
      payload,
      comment,
      mappings,
      targets,
      mismatches,
    ),
  ].every(Boolean);
}

function compareCommentValues(
  source: LoadedRecord,
  payload: Record<string, unknown>,
  comment: Comment,
  replacements: Map<string, string>,
  mismatches: string[],
): boolean {
  const body = stringValue(payload.body) ?? stringValue(payload.bodyData);
  let matches = compareProperty(
    source,
    'body',
    body ? replaceSourceUrls(body, replacements) : body,
    comment.body,
    mismatches,
  );
  matches =
    compareProperty(
      source,
      'authorName',
      sourceName(payload, 'user') ?? sourceName(payload, 'author'),
      comment.authorName,
      mismatches,
    ) && matches;
  matches =
    compareProperty(
      source,
      'createdAt',
      payload.createdAt,
      comment.createdAt,
      mismatches,
    ) && matches;
  matches =
    compareProperty(
      source,
      'updatedAt',
      payload.updatedAt,
      comment.updatedAt,
      mismatches,
    ) && matches;
  return matches;
}

function compareCommentReferences(
  source: LoadedRecord,
  payload: Record<string, unknown>,
  comment: Comment,
  mappings: Map<string, Mapping>,
  targets: Map<string, Issue>,
  mismatches: string[],
): boolean {
  let matches = true;
  const issueSourceId = sourceRef(payload, 'issue');
  const issue = issueSourceId ? targets.get(issueSourceId) : undefined;
  if (issue)
    matches =
      compareProperty(
        source,
        'issueId',
        issue.id,
        comment.issueId,
        mismatches,
      ) && matches;
  const parentSourceId =
    sourceRef(payload, 'parent') ?? stringValue(payload.parentId);
  const parentId = parentSourceId
    ? destinationIdForSource(mappings, 'comment', parentSourceId)
    : null;
  return (
    compareProperty(
      source,
      'parentCommentId',
      parentId,
      comment.parentCommentId,
      mismatches,
    ) && matches
  );
}

function compareActivity(
  source: LoadedRecord,
  payload: Record<string, unknown>,
  activity: Activity,
  mismatches: string[],
): boolean {
  let matches = compareProperty(
    source,
    'actor',
    sourceName(payload, 'actor') ?? stringValue(payload.actorId),
    activity.actor,
    mismatches,
  );
  matches =
    compareProperty(
      source,
      'action',
      historyAction(payload),
      activity.action,
      mismatches,
    ) && matches;
  return (
    compareProperty(
      source,
      'createdAt',
      payload.createdAt,
      activity.createdAt,
      mismatches,
    ) && matches
  );
}

import { inlineAttachments } from './inline-files.ts';
import {
  asRecord,
  nestedKindMap,
  stringValue,
  type Connection,
} from './model.ts';
import {
  nestedCollectionNodes,
  nestedCollectionPageInfo,
  nestedNodes,
  nestedPageInfo,
  runNestedQuery,
  hasGraphqlErrors,
} from './linear.ts';
import { addRecord, type StoredRecord } from './record-files.ts';
import type { ExportOptions } from './model.ts';

const nestedKinds = [
  'comments',
  'history',
  'attachments',
  'relations',
  'labels',
] as const;
type NestedCollection = (typeof nestedKinds)[number];

export function collectIssueNested(
  records: Map<string, StoredRecord>,
  issue: Record<string, unknown>,
  missing: string[],
): void {
  for (const [collection, kind] of [
    ['comments', 'comment'],
    ['history', 'history'],
    ['attachments', 'attachment'],
    ['relations', 'relation'],
  ] as const) {
    for (const item of nestedNodes(issue, collection)) {
      const contextual = withIssueId(item, stringValue(issue.id));
      const sourceUrl =
        collection === 'attachments'
          ? stringValue(asRecord(contextual)?.url)
          : undefined;
      addRecord(records, kind, contextual, sourceUrl);
      if (collection === 'comments')
        addInlineAttachments(records, stringValue(issue.id), contextual);
    }
    if (
      nestedPageInfo(issue, collection).hasNextPage &&
      !nestedPageInfo(issue, collection).endCursor
    )
      missing.push(
        `issue ${stringValue(issue.identifier) ?? stringValue(issue.id) ?? 'unknown'} ${collection}: missing pagination cursor`,
      );
  }
}

export async function collectNestedPages(
  options: ExportOptions,
  issues: unknown[],
  records: Map<string, StoredRecord>,
  connections: Connection[],
  missing: string[],
): Promise<void> {
  for (const collection of nestedKinds) {
    const result = await collectNestedCollection(
      options,
      issues,
      records,
      collection,
      missing,
    );
    connections.push({
      name: `nested:${collection}`,
      status: result.error ? 'failed' : 'complete',
      count: result.count,
      ...(result.error ? { error: result.error } : {}),
    });
  }
}

async function collectNestedCollection(
  options: ExportOptions,
  issues: unknown[],
  records: Map<string, StoredRecord>,
  collection: NestedCollection,
  missing: string[],
): Promise<{ count: number; error?: string }> {
  let count = 0;
  let error: string | undefined;
  for (const value of issues) {
    const result = await collectNestedIssue(
      options,
      value,
      records,
      collection,
      missing,
    );
    count += result.count;
    error ??= result.error;
  }
  return error ? { count, error } : { count };
}

async function collectNestedIssue(
  options: ExportOptions,
  value: unknown,
  records: Map<string, StoredRecord>,
  collection: NestedCollection,
  missing: string[],
): Promise<{ count: number; error?: string }> {
  const issue = asRecord(value);
  const issueId = issue ? stringValue(issue.id) : undefined;
  if (!issue || !issueId || !nestedPageInfo(issue, collection).hasNextPage)
    return { count: 0 };
  let after = nestedPageInfo(issue, collection).endCursor;
  let count = 0;
  while (after) {
    try {
      const page = await fetchNestedPage(
        options,
        issueId,
        after,
        collection,
        records,
      );
      count += page.count;
      after = page.after;
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : 'nested query failed';
      missing.push(`issue ${issueId} ${collection}: ${message}`);
      return { count, error: message };
    }
  }
  return { count };
}

async function fetchNestedPage(
  options: ExportOptions,
  issueId: string,
  after: string,
  collection: NestedCollection,
  records: Map<string, StoredRecord>,
): Promise<{ count: number; after?: string }> {
  const output = await runNestedQuery(issueId, collection, after, options);
  const errors = hasGraphqlErrors(output);
  if (errors.length) throw new Error(errors.join('; '));
  const items = nestedCollectionNodes(output, collection);
  for (const item of items) {
    const contextual = withIssueId(item, issueId);
    const sourceUrl =
      collection === 'attachments'
        ? stringValue(asRecord(contextual)?.url)
        : undefined;
    addRecord(records, nestedKindMap[collection], contextual, sourceUrl);
    if (collection === 'comments')
      addInlineAttachments(records, issueId, contextual);
  }
  const page = nestedCollectionPageInfo(output, collection);
  if (page.hasNextPage && !page.endCursor)
    throw new Error('nested page hasNextPage without endCursor');
  return {
    count: items.length,
    after: page.hasNextPage ? page.endCursor : undefined,
  };
}

function withIssueId(value: unknown, issueId: string | undefined): unknown {
  const record = asRecord(value);
  return record && issueId ? { ...record, issueId } : value;
}

function addInlineAttachments(
  records: Map<string, StoredRecord>,
  issueId: string | undefined,
  payload: unknown,
): void {
  if (!issueId) return;
  for (const attachment of inlineAttachments(payload, issueId))
    addRecord(records, 'attachment', attachment, attachment.url);
}

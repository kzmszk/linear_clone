import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { asRecord, stringValue, type ExportOptions } from './model.ts';

const execFileAsync = promisify(execFile);

export const organizationQuery = `query { organization { id name } }`;
export const teamsQuery = `query($after: String) { teams(first: 25, after: $after, includeArchived: true) { nodes { id key name private description archivedAt createdAt updatedAt } pageInfo { hasNextPage endCursor } } }`;
export const statesQuery = `query($after: String) { workflowStates(first: 100, after: $after, includeArchived: true) { nodes { id name type color position description archivedAt createdAt updatedAt team { id key name } } pageInfo { hasNextPage endCursor } } }`;
export const labelsQuery = `query($after: String) { issueLabels(first: 100, after: $after, includeArchived: true) { nodes { id name color description archivedAt createdAt updatedAt } pageInfo { hasNextPage endCursor } } }`;
export const projectsQuery = `query($after: String) { projects(first: 25, after: $after, includeArchived: true) { nodes { id name description status { name type } archivedAt createdAt updatedAt teams(first: 100) { nodes { id key name } pageInfo { hasNextPage endCursor } } } pageInfo { hasNextPage endCursor } } }`;
export const usersQuery = `query($after: String) { users(first: 100, after: $after, includeDisabled: true, includeArchived: true) { nodes { id name displayName email active archivedAt createdAt updatedAt } pageInfo { hasNextPage endCursor } } }`;
export const issuesQuery = `query($after: String) { issues(first: 100, after: $after, includeArchived: true) { nodes { id identifier number title description descriptionState archivedAt createdAt updatedAt completedAt canceledAt dueDate estimate priority previousIdentifiers team { id key name } state { id name type color position team { id key name } } creator { id name displayName email } assignee { id name displayName email } project { id name status { name type } } parent { id identifier } labels(first: 100, includeArchived: true) { nodes { id name color description archivedAt createdAt updatedAt } pageInfo { hasNextPage endCursor } } comments(first: 100, includeArchived: true) { nodes { id body bodyData createdAt updatedAt editedAt parentId user { id name displayName email } } pageInfo { hasNextPage endCursor } } attachments(first: 100, includeArchived: true) { nodes { id title subtitle url metadata source sourceType createdAt updatedAt archivedAt } pageInfo { hasNextPage endCursor } } history(first: 100, includeArchived: true) { nodes { id createdAt updatedAt actor { id name displayName email } actorId changes fromTitle toTitle fromStateId toStateId fromAssigneeId toAssigneeId fromProjectId toProjectId fromParentId toParentId archived trashed } pageInfo { hasNextPage endCursor } } relations(first: 100, includeArchived: true) { nodes { id type createdAt updatedAt issue { id identifier } relatedIssue { id identifier } } pageInfo { hasNextPage endCursor } } } pageInfo { hasNextPage endCursor } } }`;

type LinearRunOptions = Pick<ExportOptions, 'linearCommand' | 'workspace'>;

export async function runLinearQuery(
  query: string,
  options: LinearRunOptions,
): Promise<unknown> {
  const command = options.linearCommand ?? 'linear';
  const args = ['api', '--paginate', query];
  if (options.workspace) args.push('--workspace', options.workspace);
  try {
    const result = await execFileAsync(command, args, {
      maxBuffer: 128 * 1024 * 1024,
      env: process.env,
    });
    return parseCliJson(result.stdout);
  } catch {
    throw new Error(
      'Linear query failed. Check `linear auth whoami`, workspace access, and network connectivity.',
    );
  }
}

function parseCliJson(output: string): unknown {
  try {
    return JSON.parse(output) as unknown;
  } catch {
    const lines = output.trim().split('\n');
    const last = lines.at(-1);
    if (last) {
      try {
        return JSON.parse(last) as unknown;
      } catch {
        throw new Error('Linear CLI returned invalid JSON.');
      }
    }
    throw new Error('Linear CLI returned no JSON.');
  }
}

export function withoutData(value: unknown): unknown {
  const record = asRecord(value);
  return record?.data ?? value;
}

function pageInfo(value: unknown): {
  hasNextPage: boolean;
  endCursor?: string;
} {
  const record = asRecord(value);
  const info = record ? asRecord(record.pageInfo) : undefined;
  return {
    hasNextPage: info?.hasNextPage === true,
    endCursor: stringValue(info?.endCursor),
  };
}

export function collectionNodes(value: unknown, collection: string): unknown[] {
  if (Array.isArray(value))
    return value.filter((item) => asRecord(item)?.id !== undefined);
  const root = asRecord(withoutData(value));
  if (!root) return [];
  const container = asRecord(root[collection]);
  if (container) {
    const nodes = container.nodes;
    if (Array.isArray(nodes)) return nodes;
    if (Array.isArray(container.edges))
      return container.edges.flatMap((edge) => {
        const edgeRecord = asRecord(edge);
        return edgeRecord?.node === undefined ? [] : [edgeRecord.node];
      });
  }
  return [];
}

export function collectionPageInfo(
  value: unknown,
  collection: string,
): { hasNextPage: boolean; endCursor?: string } {
  const root = asRecord(withoutData(value));
  const container = root ? asRecord(root[collection]) : undefined;
  return pageInfo(container);
}

export function issuePageNodes(value: unknown): unknown[] {
  return collectionNodes(value, 'issues');
}

export function nestedNodes(
  issue: Record<string, unknown>,
  collection: string,
): unknown[] {
  const container = asRecord(issue[collection]);
  const nodes = container?.nodes;
  return Array.isArray(nodes) ? nodes : [];
}

export function nestedPageInfo(
  issue: Record<string, unknown>,
  collection: string,
): { hasNextPage: boolean; endCursor?: string } {
  return pageInfo(issue[collection]);
}

export function nestedCollectionNodes(
  value: unknown,
  collection: string,
): unknown[] {
  if (Array.isArray(value))
    return value.filter((item) => asRecord(item)?.id !== undefined);
  const root = asRecord(withoutData(value));
  const issue = root ? asRecord(root.issue) : undefined;
  return issue ? nestedNodes(issue, collection) : [];
}

export function nestedCollectionPageInfo(
  value: unknown,
  collection: string,
): { hasNextPage: boolean; endCursor?: string } {
  const root = asRecord(withoutData(value));
  const issue = root ? asRecord(root.issue) : undefined;
  return issue ? nestedPageInfo(issue, collection) : { hasNextPage: false };
}

export function hasGraphqlErrors(value: unknown): string[] {
  const root = asRecord(value);
  const errors = root?.errors;
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((error) => {
    const record = asRecord(error);
    const message = stringValue(record?.message);
    return message ? [message] : ['Unknown GraphQL error'];
  });
}

export async function runNestedQuery(
  issueId: string,
  collection: 'comments' | 'history' | 'attachments' | 'relations' | 'labels',
  after: string | undefined,
  options: LinearRunOptions,
): Promise<unknown> {
  const fragments: Record<typeof collection, string> = {
    comments:
      'id body bodyData createdAt updatedAt editedAt parentId user { id name displayName email }',
    history:
      'id createdAt updatedAt actor { id name displayName email } actorId changes fromTitle toTitle fromStateId toStateId fromAssigneeId toAssigneeId fromProjectId toProjectId fromParentId toParentId archived trashed',
    attachments:
      'id title subtitle url metadata source sourceType createdAt updatedAt archivedAt',
    relations:
      'id type createdAt updatedAt issue { id identifier } relatedIssue { id identifier }',
    labels: 'id name color description archivedAt createdAt updatedAt',
  };
  const afterArgument = after ? `, after: ${JSON.stringify(after)}` : '';
  const query = `query { issue(id: ${JSON.stringify(issueId)}) { ${collection}(first: 100${afterArgument}, includeArchived: true) { nodes { ${fragments[collection]} } pageInfo { hasNextPage endCursor } } } }`;
  return runLinearQuery(query, options);
}

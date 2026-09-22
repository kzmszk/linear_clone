import { randomUUID } from 'node:crypto';
import {
  issuePatchSchema,
  newCommentSchema,
  newIssueSchema,
  type Metadata,
} from '../../../../packages/contracts/src/index.ts';
import type { SyncOperation } from '../../../../packages/contracts/src/sync.ts';
import type { LocalIssue, Projection } from './model.ts';
import type { LocalWriteContext } from './projection.ts';
import {
  defaultState,
  resolveAssignee,
  resolveLabel,
  resolveProject,
  resolveState,
  resolveTeam,
} from './references.ts';

export type CreateIssueValues = {
  team: string;
  title: string;
  description: string | null;
  state?: string;
  priority: number;
  assignee?: string;
  project?: string;
  parent?: string;
  estimate?: number;
  dueDate?: string;
  labels: string[];
};

export type UpdateIssueValues = {
  expectedVersion?: number;
  title?: string;
  description?: string | null;
  state?: string;
  priority?: number;
  assignee?: string | null;
  project?: string | null;
  parent?: string | null;
  estimate?: number | null;
  dueDate?: string | null;
  labels?: string[];
};

export type IssueListValues = {
  team?: string;
  state?: string;
  assignee?: string;
  project?: string;
  search?: string;
  archived: boolean;
  deleted: boolean;
  all: boolean;
  closed: boolean;
};

export function issueCreateOperation(
  context: LocalWriteContext,
  values: CreateIssueValues,
): SyncOperation {
  const metadata = context.snapshot.metadata;
  const team = resolveTeam(metadata, values.team);
  const stateId = values.state
    ? resolveState(metadata, values.state, team.id)
    : defaultState(metadata, team.id);
  const projectId = values.project
    ? resolveProject(metadata, values.project, team.id)
    : null;
  const operationId = randomUUID();
  return {
    kind: 'issue.create',
    operationId,
    input: newIssueSchema.parse({
      teamId: team.id,
      title: values.title,
      description: values.description,
      stateId,
      priority: values.priority,
      assigneeId: values.assignee
        ? resolveAssignee(metadata, values.assignee)
        : null,
      projectId,
      parentId: values.parent
        ? resolveIssue(context.projection, values.parent).id
        : null,
      estimate: values.estimate ?? null,
      dueDate: values.dueDate ?? null,
      labelIds: values.labels.map((label) => resolveLabel(metadata, label)),
    }),
  };
}

export function issueUpdateOperation(
  context: LocalWriteContext,
  reference: string,
  values: UpdateIssueValues,
): SyncOperation {
  const issue = resolveIssue(context.projection, reference);
  if (
    values.expectedVersion !== undefined &&
    values.expectedVersion !== issue.version
  )
    throw new Error(
      `Local version conflict: expected ${values.expectedVersion}, current ${issue.version}.`,
    );
  const fields = updateFields(context, issue, values);
  if (Object.keys(fields).length === 0)
    throw new Error('Provide an issue field to update.');
  return {
    kind: 'issue.update',
    operationId: randomUUID(),
    issueId: issue.id,
    input: issuePatchSchema.parse({
      ...fields,
      expectedVersion: values.expectedVersion ?? issue.version,
    }),
  };
}

function updateFields(
  context: LocalWriteContext,
  issue: LocalIssue,
  values: UpdateIssueValues,
): Record<string, unknown> {
  const metadata = context.snapshot.metadata;
  return {
    ...simpleUpdateFields(values),
    ...referenceUpdateFields(context, issue, values),
    ...(values.labels === undefined
      ? {}
      : {
          labelIds: values.labels.map((label) => resolveLabel(metadata, label)),
        }),
  };
}

function simpleUpdateFields(values: UpdateIssueValues) {
  return {
    ...(values.title === undefined ? {} : { title: values.title }),
    ...(values.description === undefined
      ? {}
      : { description: values.description }),
    ...(values.priority === undefined ? {} : { priority: values.priority }),
    ...(values.estimate === undefined ? {} : { estimate: values.estimate }),
    ...(values.dueDate === undefined ? {} : { dueDate: values.dueDate }),
  };
}

function referenceUpdateFields(
  context: LocalWriteContext,
  issue: LocalIssue,
  values: UpdateIssueValues,
) {
  const metadata = context.snapshot.metadata;
  return {
    ...(values.state === undefined
      ? {}
      : { stateId: resolveState(metadata, values.state, issue.teamId) }),
    ...(values.assignee === undefined
      ? {}
      : {
          assigneeId:
            values.assignee === null
              ? null
              : resolveAssignee(metadata, values.assignee),
        }),
    ...(values.project === undefined
      ? {}
      : {
          projectId:
            values.project === null
              ? null
              : resolveProject(metadata, values.project, issue.teamId),
        }),
    ...(values.parent === undefined
      ? {}
      : {
          parentId:
            values.parent === null
              ? null
              : resolveIssue(context.projection, values.parent).id,
        }),
  };
}

export function issueLifecycleOperation(
  context: LocalWriteContext,
  reference: string,
  kind: 'issue.delete' | 'issue.restore',
  expectedVersion?: number,
): SyncOperation {
  const issue = resolveIssue(context.projection, reference);
  if (expectedVersion !== undefined && expectedVersion !== issue.version)
    throw new Error(
      `Local version conflict: expected ${expectedVersion}, current ${issue.version}.`,
    );
  return {
    kind,
    operationId: randomUUID(),
    issueId: issue.id,
    expectedVersion: expectedVersion ?? issue.version,
  };
}

export function commentCreateOperation(
  context: LocalWriteContext,
  issueReference: string,
  body: string,
  parentCommentId: string | null,
): SyncOperation {
  const issue = resolveIssue(context.projection, issueReference);
  if (
    parentCommentId !== null &&
    !context.projection.comments.some(
      (comment) =>
        comment.id === parentCommentId && comment.issueId === issue.id,
    )
  )
    throw new Error(`Parent comment not found: ${parentCommentId}`);
  return {
    kind: 'comment.create',
    operationId: randomUUID(),
    issueId: issue.id,
    input: newCommentSchema.parse({ body, parentCommentId }),
  };
}

export function resolveIssue(
  projection: Projection,
  reference: string,
): LocalIssue {
  const needle = reference.toLowerCase();
  const issue = projection.issues.find(
    (item) => item.id === reference || item.identifier.toLowerCase() === needle,
  );
  if (!issue) throw new Error(`Issue not found: ${reference}`);
  return issue;
}

export function filterIssues(
  issues: LocalIssue[],
  metadata: Metadata,
  values: IssueListValues,
): LocalIssue[] {
  if (values.all && values.closed)
    throw new Error('Use only one of --all and --closed.');
  const teamId = values.team
    ? resolveTeam(metadata, values.team).id
    : undefined;
  const stateId = values.state
    ? resolveState(metadata, values.state, teamId)
    : undefined;
  const projectId = values.project
    ? resolveProject(metadata, values.project, teamId)
    : undefined;
  const assigneeId = values.assignee
    ? resolveAssignee(metadata, values.assignee)
    : undefined;
  const closedStates = new Set(
    metadata.states
      .filter(
        (state) => state.type === 'completed' || state.type === 'canceled',
      )
      .map((state) => state.id),
  );
  const query = values.search?.toLowerCase();
  return issues.filter(
    (issue) =>
      matchesIssueFilters(issue, values, {
        teamId,
        stateId,
        projectId,
        assigneeId,
      }) &&
      matchesLifecycle(issue, values, closedStates) &&
      matchesQuery(issue, query),
  );
}

function matchesIssueFilters(
  issue: LocalIssue,
  values: IssueListValues,
  ids: {
    teamId?: string;
    stateId?: string;
    projectId?: string;
    assigneeId?: string;
  },
): boolean {
  if ((issue.archivedAt !== null) !== values.archived) return false;
  if ((issue.deletedAt !== null) !== values.deleted) return false;
  if (ids.teamId && issue.teamId !== ids.teamId) return false;
  if (ids.stateId && issue.stateId !== ids.stateId) return false;
  if (ids.projectId && issue.projectId !== ids.projectId) return false;
  return !ids.assigneeId || issue.assigneeId === ids.assigneeId;
}

function matchesLifecycle(
  issue: LocalIssue,
  values: IssueListValues,
  closedStates: Set<string>,
): boolean {
  const closed = closedStates.has(issue.stateId);
  if (values.closed) return closed;
  if (values.all || values.state || values.deleted || values.archived)
    return true;
  return !closed;
}

function matchesQuery(issue: LocalIssue, query?: string): boolean {
  return (
    !query ||
    issue.title.toLowerCase().includes(query) ||
    issue.identifier.toLowerCase().includes(query)
  );
}

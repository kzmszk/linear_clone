import {
  issueSchema,
  type Comment,
} from '../../../../packages/contracts/src/index.ts';
import type {
  SyncOperation,
  SyncSnapshot,
} from '../../../../packages/contracts/src/sync.ts';
import {
  appendOperation,
  readOperations,
  readSnapshot,
  transaction,
  writeProjection,
  type LocalStore,
} from './store.ts';
import type {
  LocalComment,
  LocalIssue,
  LocalSyncState,
  Projection,
  StoredOperation,
} from './model.ts';

export type LocalWriteContext = {
  snapshot: SyncSnapshot;
  projection: Projection;
};

export type LocalWriteResult =
  | { kind: 'issue'; operationId: string; current: LocalIssue }
  | { kind: 'comment'; operationId: string; current: LocalComment };

export function commitLocalOperation(
  store: LocalStore,
  build: (context: LocalWriteContext) => SyncOperation,
): LocalWriteResult {
  return transaction(store, () => {
    const snapshot = readSnapshot(store);
    const before = readOperations(store);
    const current = projectSnapshot(snapshot, before);
    const operation = build({ snapshot, projection: current });
    const createdAt = new Date().toISOString();
    appendOperation(store, operation, createdAt);
    const entry: StoredOperation = {
      sequence: (before.at(-1)?.sequence ?? 0) + 1,
      operation,
      createdAt,
      failure: null,
    };
    const projection = projectSnapshot(snapshot, [...before, entry]);
    writeProjection(store, projection);
    return resultFor(operation, projection);
  });
}

export function rebuildProjection(store: LocalStore): Projection {
  const projection = projectSnapshot(
    readSnapshot(store),
    readOperations(store),
  );
  writeProjection(store, projection);
  return projection;
}

export function projectSnapshot(
  snapshot: SyncSnapshot,
  operations: StoredOperation[],
): Projection {
  const issues = new Map<string, LocalIssue>(
    snapshot.issues.map((issue) => [
      issue.id,
      { ...issue, syncState: 'synced' },
    ]),
  );
  const comments = new Map<string, LocalComment>(
    snapshot.comments.map((comment) => [
      comment.id,
      { ...comment, syncState: 'synced' },
    ]),
  );
  let blocked = false;
  for (const entry of operations) {
    const state: LocalSyncState = entry.failure
      ? 'conflict'
      : blocked
        ? 'blocked'
        : 'pending';
    applyOperation(snapshot, issues, comments, entry, state);
    if (entry.failure) blocked = true;
  }
  return { issues: [...issues.values()], comments: [...comments.values()] };
}

function applyOperation(
  snapshot: SyncSnapshot,
  issues: Map<string, LocalIssue>,
  comments: Map<string, LocalComment>,
  entry: StoredOperation,
  state: LocalSyncState,
): void {
  const operation = entry.operation;
  switch (operation.kind) {
    case 'issue.create':
      applyIssueCreate(snapshot, issues, operation, entry.createdAt, state);
      return;
    case 'issue.update':
      applyIssueUpdate(snapshot, issues, operation, entry.createdAt, state);
      return;
    case 'issue.delete':
      applyIssueLifecycle(
        issues,
        operation.issueId,
        entry.createdAt,
        true,
        state,
      );
      return;
    case 'issue.restore':
      applyIssueLifecycle(
        issues,
        operation.issueId,
        entry.createdAt,
        false,
        state,
      );
      return;
    case 'comment.create':
      applyCommentCreate(snapshot, comments, operation, entry.createdAt, state);
      return;
  }
}

function applyIssueCreate(
  snapshot: SyncSnapshot,
  issues: Map<string, LocalIssue>,
  operation: Extract<SyncOperation, { kind: 'issue.create' }>,
  timestamp: string,
  state: LocalSyncState,
): void {
  const existing = issues.get(operation.operationId);
  if (existing) {
    issues.set(existing.id, { ...existing, syncState: state });
    return;
  }
  const input = operation.input;
  const team = snapshot.metadata.teams.find((item) => item.id === input.teamId);
  if (!team) return;
  const stateId = input.stateId ?? defaultStateId(snapshot, input.teamId);
  if (!stateId) return;
  const workflowState = snapshot.metadata.states.find(
    (item) => item.id === stateId,
  );
  const issue = issueSchema.parse({
    id: operation.operationId,
    workspaceId: snapshot.workspace.id,
    teamId: input.teamId,
    identifier: `LOCAL-${operation.operationId.slice(0, 8)}`,
    number: 0,
    title: input.title,
    description: input.description,
    stateId,
    priority: input.priority,
    assigneeId: input.assigneeId,
    assigneeName: assigneeName(snapshot, input.assigneeId),
    projectId: input.projectId,
    parentId: input.parentId,
    estimate: input.estimate,
    dueDate: input.dueDate,
    labelIds: input.labelIds,
    archivedAt: null,
    deletedAt: null,
    completedAt: workflowState?.type === 'completed' ? timestamp : null,
    canceledAt: workflowState?.type === 'canceled' ? timestamp : null,
    sourceId: null,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  issues.set(issue.id, { ...issue, syncState: state });
}

function applyIssueUpdate(
  snapshot: SyncSnapshot,
  issues: Map<string, LocalIssue>,
  operation: Extract<SyncOperation, { kind: 'issue.update' }>,
  timestamp: string,
  state: LocalSyncState,
): void {
  const issue = issues.get(operation.issueId);
  if (!issue) return;
  const input = operation.input;
  const stateId = input.stateId ?? issue.stateId;
  const workflowState = snapshot.metadata.states.find(
    (item) => item.id === stateId,
  );
  const dates = stateDates(
    issue,
    input.stateId,
    workflowState?.type,
    timestamp,
  );
  issues.set(issue.id, {
    ...issue,
    ...simpleIssuePatch(input),
    ...relationIssuePatch(snapshot, input),
    stateId,
    ...dates,
    version: Math.max(issue.version, input.expectedVersion) + 1,
    updatedAt: timestamp,
    syncState: state,
  });
}

type IssueUpdateInput = Extract<
  SyncOperation,
  { kind: 'issue.update' }
>['input'];

function simpleIssuePatch(input: IssueUpdateInput) {
  return {
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
    ...(input.estimate === undefined ? {} : { estimate: input.estimate }),
    ...(input.dueDate === undefined ? {} : { dueDate: input.dueDate }),
    ...(input.labelIds === undefined ? {} : { labelIds: input.labelIds }),
    ...(input.archivedAt === undefined ? {} : { archivedAt: input.archivedAt }),
  };
}

function relationIssuePatch(snapshot: SyncSnapshot, input: IssueUpdateInput) {
  if (input.assigneeId === undefined) return {};
  return {
    assigneeId: input.assigneeId,
    assigneeName: assigneeName(snapshot, input.assigneeId),
  };
}

function stateDates(
  issue: LocalIssue,
  nextStateId: string | undefined,
  nextStateType: string | undefined,
  timestamp: string,
) {
  if (nextStateId === undefined)
    return {
      completedAt: issue.completedAt,
      canceledAt: issue.canceledAt,
    };
  return {
    completedAt: nextStateType === 'completed' ? timestamp : null,
    canceledAt: nextStateType === 'canceled' ? timestamp : null,
  };
}

function applyIssueLifecycle(
  issues: Map<string, LocalIssue>,
  issueId: string,
  timestamp: string,
  deleted: boolean,
  state: LocalSyncState,
): void {
  const issue = issues.get(issueId);
  if (!issue) return;
  issues.set(issue.id, {
    ...issue,
    deletedAt: deleted ? timestamp : null,
    version: issue.version + 1,
    updatedAt: timestamp,
    syncState: state,
  });
}

function applyCommentCreate(
  snapshot: SyncSnapshot,
  comments: Map<string, LocalComment>,
  operation: Extract<SyncOperation, { kind: 'comment.create' }>,
  timestamp: string,
  state: LocalSyncState,
): void {
  const existing = comments.get(operation.operationId);
  if (existing) {
    comments.set(existing.id, { ...existing, syncState: state });
    return;
  }
  const comment: Comment = {
    id: operation.operationId,
    workspaceId: snapshot.workspace.id,
    issueId: operation.issueId,
    body: operation.input.body,
    authorName: snapshot.principal.email,
    parentCommentId: operation.input.parentCommentId,
    deletedAt: null,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  comments.set(comment.id, { ...comment, syncState: state });
}

function defaultStateId(
  snapshot: SyncSnapshot,
  teamId: string,
): string | undefined {
  const state = snapshot.metadata.states
    .filter((item) => item.teamId === teamId)
    .sort(
      (left, right) =>
        left.position - right.position || left.id.localeCompare(right.id),
    )[0];
  return state?.id;
}

function assigneeName(
  snapshot: SyncSnapshot,
  assigneeId: string | null,
): string | null {
  if (assigneeId === null) return null;
  return (
    snapshot.metadata.members.find((member) => member.userId === assigneeId)
      ?.name ?? null
  );
}

function resultFor(
  operation: SyncOperation,
  projection: Projection,
): LocalWriteResult {
  if (operation.kind === 'comment.create') {
    const current = projection.comments.find(
      (comment) => comment.id === operation.operationId,
    );
    if (!current) throw new Error('Local comment projection failed.');
    return { kind: 'comment', operationId: operation.operationId, current };
  }
  const issueId =
    operation.kind === 'issue.create'
      ? operation.operationId
      : operation.issueId;
  const current = projection.issues.find((issue) => issue.id === issueId);
  if (!current) throw new Error('Local issue projection failed.');
  return { kind: 'issue', operationId: operation.operationId, current };
}

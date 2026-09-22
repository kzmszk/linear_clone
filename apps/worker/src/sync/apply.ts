import type { DurableObjectStorage } from '@cloudflare/workers-types';
import type {
  SyncOperation,
  SyncResponse,
} from '../../../../packages/contracts/src/sync.ts';
import { HttpError } from '../errors.ts';
import { createComment, type CommentInput } from '../issues/comments.ts';
import {
  createIssue,
  deleteIssue,
  patchIssue,
  restoreIssue,
} from '../issues/mutations.ts';
import type { AuthActor, MutationReceipt, SqlDb } from '../types.ts';

export type PreparedSyncOperation = {
  operation: SyncOperation;
  requestHash: string;
};

type SyncAccepted = SyncResponse['accepted'][number];
type SyncFailure = NonNullable<SyncResponse['failure']>;

type SyncApplyContext = {
  sql: SqlDb;
  storage: DurableObjectStorage;
  actor: AuthActor;
  workspaceId: string;
};

export type SyncApplyResult = {
  accepted: SyncAccepted[];
  failure: SyncFailure | null;
};

export function applySyncOperations(
  context: SyncApplyContext,
  operations: PreparedSyncOperation[],
): SyncApplyResult {
  const accepted: SyncAccepted[] = [];
  for (const prepared of operations) {
    try {
      const result = applySyncOperation(context, prepared);
      accepted.push(acceptedReceipt(result.receipt));
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return {
        accepted,
        failure: syncFailure(prepared.operation.operationId, error),
      };
    }
  }
  return { accepted, failure: null };
}

function applySyncOperation(
  context: SyncApplyContext,
  prepared: PreparedSyncOperation,
) {
  const { operation, requestHash } = prepared;
  switch (operation.kind) {
    case 'issue.create':
      return createIssue(
        context.sql,
        context.storage,
        context.actor,
        context.workspaceId,
        operation.operationId,
        requestHash,
        operation.input,
        { id: operation.operationId },
      );
    case 'issue.update':
      return patchIssue(
        context.sql,
        context.storage,
        context.actor,
        context.workspaceId,
        operation.issueId,
        operation.operationId,
        requestHash,
        operation.input,
      );
    case 'issue.delete':
      return deleteIssue(
        context.sql,
        context.storage,
        context.actor,
        context.workspaceId,
        operation.issueId,
        operation.operationId,
        requestHash,
        operation.expectedVersion,
      );
    case 'issue.restore':
      return restoreIssue(
        context.sql,
        context.storage,
        context.actor,
        context.workspaceId,
        operation.issueId,
        operation.operationId,
        requestHash,
        operation.expectedVersion,
      );
    case 'comment.create':
      return createComment(
        context.sql,
        context.storage,
        context.actor,
        context.workspaceId,
        operation.issueId,
        operation.operationId,
        requestHash,
        operation.input satisfies CommentInput,
        { id: operation.operationId },
      );
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

function acceptedReceipt(receipt: MutationReceipt): SyncAccepted {
  return {
    operationId: receipt.operationId,
    entityId: receipt.entityId,
    version: receipt.version,
  };
}

function syncFailure(operationId: string, error: HttpError): SyncFailure {
  return {
    operationId,
    status: error.status,
    code: error.code,
    message: error.message,
    ...(error.current === undefined ? {} : { current: error.current }),
  };
}

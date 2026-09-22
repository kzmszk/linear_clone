import * as z from 'zod';
import {
  commentSchema,
  issueSchema,
} from '../../../../packages/contracts/src/index.ts';
import {
  syncOperationSchema,
  syncResponseSchema,
  syncSnapshotSchema,
  type SyncOperation,
  type SyncSnapshot,
} from '../../../../packages/contracts/src/sync.ts';

const syncStateSchema = z.enum(['synced', 'pending', 'conflict', 'blocked']);
export type LocalSyncState = z.infer<typeof syncStateSchema>;

export const localFailureSchema = syncResponseSchema.shape.failure.unwrap();
export type LocalFailure = z.infer<typeof localFailureSchema>;

export const bindingSchema = z.object({
  url: z.string().url(),
  workspaceId: z.string().uuid(),
  workspaceSlug: z.string(),
  issuer: z.string(),
  subject: z.string(),
  email: z.email(),
  sequence: z.number().int().nonnegative(),
  lastSyncAt: z.string().nullable(),
  lastError: localFailureSchema.nullable(),
});
export type LocalBinding = z.infer<typeof bindingSchema>;

export type StoredOperation = {
  sequence: number;
  operation: SyncOperation;
  createdAt: string;
  failure: LocalFailure | null;
};

export type LocalIssue = z.infer<typeof issueSchema> & {
  syncState: LocalSyncState;
};
export type LocalComment = z.infer<typeof commentSchema> & {
  syncState: LocalSyncState;
};

export type Projection = {
  issues: LocalIssue[];
  comments: LocalComment[];
};

const storedOperationRowSchema = z.object({
  sequence: z.number().int().positive(),
  operation_json: z.string(),
  created_at: z.string(),
  failure_json: z.string().nullable(),
});

export function parseStoredOperation(value: unknown): StoredOperation {
  const row = storedOperationRowSchema.parse(value);
  return {
    sequence: row.sequence,
    operation: syncOperationSchema.parse(JSON.parse(row.operation_json)),
    createdAt: row.created_at,
    failure:
      row.failure_json === null
        ? null
        : localFailureSchema.parse(JSON.parse(row.failure_json)),
  };
}

const viewRowSchema = z.object({
  record_json: z.string(),
  sync_state: syncStateSchema,
});

export function parseIssueView(value: unknown): LocalIssue {
  const row = viewRowSchema.parse(value);
  return {
    ...issueSchema.parse(JSON.parse(row.record_json)),
    syncState: row.sync_state,
  };
}

export function parseCommentView(value: unknown): LocalComment {
  const row = viewRowSchema.parse(value);
  return {
    ...commentSchema.parse(JSON.parse(row.record_json)),
    syncState: row.sync_state,
  };
}

export function parseSnapshot(value: string): SyncSnapshot {
  return syncSnapshotSchema.parse(JSON.parse(value));
}

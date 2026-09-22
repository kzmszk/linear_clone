import * as z from 'zod';
import {
  commentSchema,
  issuePatchSchema,
  issueSchema,
  metadataSchema,
  newCommentSchema,
  newIssueSchema,
  workspaceSchema,
} from './index.ts';

const uuid = z.string().uuid();
const positiveVersion = z.number().int().positive();
export const syncRequestMaxBytes = 8 * 1024 * 1024;

const issueCreateOperationSchema = z.object({
  kind: z.literal('issue.create'),
  operationId: uuid,
  input: newIssueSchema,
});

const issueUpdateOperationSchema = z.object({
  kind: z.literal('issue.update'),
  operationId: uuid,
  issueId: uuid,
  input: issuePatchSchema,
});

const issueDeleteOperationSchema = z.object({
  kind: z.literal('issue.delete'),
  operationId: uuid,
  issueId: uuid,
  expectedVersion: positiveVersion,
});

const issueRestoreOperationSchema = z.object({
  kind: z.literal('issue.restore'),
  operationId: uuid,
  issueId: uuid,
  expectedVersion: positiveVersion,
});

const commentCreateOperationSchema = z.object({
  kind: z.literal('comment.create'),
  operationId: uuid,
  issueId: uuid,
  input: newCommentSchema,
});

export const syncOperationSchema = z.discriminatedUnion('kind', [
  issueCreateOperationSchema,
  issueUpdateOperationSchema,
  issueDeleteOperationSchema,
  issueRestoreOperationSchema,
  commentCreateOperationSchema,
]);

export const syncRequestSchema = z.object({
  operations: z.array(syncOperationSchema).max(500),
  afterSequence: z.number().int().nonnegative().optional(),
});

const syncAcceptedSchema = z.object({
  operationId: uuid,
  entityId: uuid,
  version: positiveVersion,
});

const syncFailureSchema = z.object({
  operationId: uuid,
  status: z.number().int().min(400).max(599),
  code: z.string(),
  message: z.string(),
  current: z.unknown().optional(),
});

const syncPrincipalSchema = z.object({
  issuer: z.string(),
  subject: z.string(),
  email: z.email(),
});

export const syncSnapshotSchema = z.object({
  principal: syncPrincipalSchema,
  workspace: workspaceSchema,
  metadata: metadataSchema,
  issues: z.array(issueSchema),
  comments: z.array(commentSchema),
  sequence: z.number().int().nonnegative(),
});

export const syncResponseSchema = z.object({
  principal: syncPrincipalSchema,
  workspaceId: uuid,
  sequence: z.number().int().nonnegative(),
  accepted: z.array(syncAcceptedSchema),
  failure: syncFailureSchema.nullable(),
  snapshot: syncSnapshotSchema.nullable(),
});

export type SyncOperation = z.infer<typeof syncOperationSchema>;
export type SyncResponse = z.infer<typeof syncResponseSchema>;
export type SyncSnapshot = z.infer<typeof syncSnapshotSchema>;

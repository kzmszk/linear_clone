import { z } from 'zod';

export const importKinds = [
  'team',
  'state',
  'label',
  'member',
  'project',
  'issue',
  'comment',
  'relation',
  'history',
  'attachment',
] as const;

export type ImportKind = (typeof importKinds)[number];

const importKindSchema = z.enum(importKinds);

const sourceIdentitySchema = z.object({
  provider: z.literal('linear'),
  sourceId: z.string(),
  name: z.string(),
  email: z.string().nullable(),
});

export type SourceIdentity = z.infer<typeof sourceIdentitySchema>;

export const importFileSchema = z.object({
  sourceId: z.string(),
  sourceUrl: z.string(),
  localFile: z.string().optional(),
  checksum: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  contentType: z.string().optional(),
  destinationUrl: z.string().optional(),
  state: z.enum(['ready', 'missing', 'external']).default('missing'),
  reason: z.string().optional(),
});

export type ImportFile = z.infer<typeof importFileSchema>;

const importBatchItemSchema = z.object({
  sourceId: z.string().min(1),
  sourceRevision: z.string().min(1),
  payload: z.unknown(),
  sourceIdentity: sourceIdentitySchema.optional(),
  file: importFileSchema.optional(),
});

export type ImportBatchItem = z.infer<typeof importBatchItemSchema>;

export const importBatchSchema = z.object({
  runId: z.string().uuid(),
  provider: z.literal('linear'),
  sourceWorkspaceId: z.string().min(1),
  kind: importKindSchema,
  items: z.array(importBatchItemSchema),
});

export type ImportBatch = z.infer<typeof importBatchSchema>;

export const importVerifySchema = z.object({
  runId: z.string().uuid(),
  provider: z.literal('linear'),
  sourceWorkspaceId: z.string().min(1),
});

export type ImportVerifyInput = z.infer<typeof importVerifySchema>;

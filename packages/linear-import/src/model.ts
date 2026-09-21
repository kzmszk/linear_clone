import { createHash } from 'node:crypto';
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
export const nestedKindMap = {
  comments: 'comment',
  history: 'history',
  attachments: 'attachment',
  relations: 'relation',
  labels: 'label',
} as const satisfies Record<string, ImportKind>;

export const connectionSchema = z.object({
  name: z.string(),
  status: z.enum(['complete', 'failed', 'missing']),
  count: z.number().int().nonnegative(),
  error: z.string().optional(),
});
export const recordSummarySchema = z.object({
  kind: z.enum(importKinds),
  sourceId: z.string(),
  sourceRevision: z.string(),
  payloadHash: z.string(),
  rawFile: z.string(),
  sourceUrl: z.string().nullable().optional(),
});
export const fileSummarySchema = z.object({
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
export const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  provider: z.literal('linear'),
  runId: z.string().uuid(),
  sourceWorkspaceId: z.string().min(1),
  sourceWorkspaceName: z.string().optional(),
  exportedAt: z.string(),
  records: z.array(recordSummarySchema),
  files: z.array(fileSummarySchema),
  connections: z.array(connectionSchema),
  missing: z.array(z.string()),
});
export type Connection = z.infer<typeof connectionSchema>;
export type RecordSummary = z.infer<typeof recordSummarySchema>;
export type FileSummary = z.infer<typeof fileSummarySchema>;
export type Manifest = z.infer<typeof manifestSchema>;

export type ExportOptions = {
  outputDir: string;
  workspace?: string;
  linearCommand?: string;
  downloadFiles?: boolean;
};

export type ImportBatchItem = {
  sourceId: string;
  sourceRevision: string;
  payload: unknown;
  sourceIdentity?: SourceIdentity;
  file?: FileSummary;
};

export type SourceIdentity = {
  provider: 'linear';
  sourceId: string;
  name: string;
  email: string | null;
};
export type FileUpload = {
  url: string;
  checksum: string;
  size: number;
  contentType: string;
};

export type FileDownload = {
  bytes: Uint8Array;
  contentType: string | null;
};

export type ImportBatch = {
  runId: string;
  provider: 'linear';
  sourceWorkspaceId: string;
  kind: ImportKind;
  items: ImportBatchItem[];
};

export type ImportTransport = {
  request<T>(
    path: string,
    schema: z.ZodType<T>,
    init?: { method?: string; body?: unknown; operationId?: string },
  ): Promise<T>;
  uploadFile?: (
    workspaceId: string,
    issueId: string,
    content: Blob,
  ) => Promise<FileUpload>;
  downloadFile?: (path: string) => Promise<FileDownload>;
};

export type ImportPlan = {
  manifest: Manifest;
  counts: Record<ImportKind, number>;
  unresolved: string[];
  warnings: string[];
};

export function hashBytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashJson(value: unknown): { text: string; hash: string } {
  const text = JSON.stringify(value);
  return { text, hash: hashBytes(Buffer.from(text, 'utf8')) };
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function nestedRecord(
  value: unknown,
  key: string,
): Record<string, unknown> | undefined {
  const record = asRecord(value);
  return record ? asRecord(record[key]) : undefined;
}

export function nestedString(value: unknown, key: string): string | undefined {
  const record = asRecord(value);
  return record ? stringValue(record[key]) : undefined;
}

export function sourceRevision(payload: unknown): string {
  return (
    nestedString(payload, 'updatedAt') ??
    nestedString(payload, 'createdAt') ??
    hashJson(payload).hash
  );
}

export function sourceIdentity(payload: unknown): SourceIdentity | undefined {
  const record = asRecord(payload);
  const actor =
    nestedRecord(record, 'user') ??
    nestedRecord(record, 'actor') ??
    nestedRecord(record, 'creator') ??
    nestedRecord(record, 'assignee') ??
    (stringValue(record?.email) ? record : undefined);
  if (!actor) return undefined;
  const sourceId = stringValue(actor.id);
  const name = stringValue(actor.name) ?? stringValue(actor.displayName);
  if (!sourceId || !name) return undefined;
  return {
    provider: 'linear',
    sourceId,
    name,
    email: stringValue(actor.email) ?? null,
  };
}

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod';
import { isPrivateRelativePath, readJson, writePrivateJson } from './files.ts';
import {
  asRecord,
  importKinds,
  nestedRecord,
  sourceIdentity,
  stringValue,
  type ImportBatch,
  type ImportBatchItem,
  type FileSummary,
  type ImportKind,
  type ImportTransport,
} from './model.ts';
import { readExport, type LoadedExport, type LoadedRecord } from './plan.ts';

const checkpointSchema = z.object({
  manifestRunId: z.string().uuid(),
  destinationKey: z.string().min(1),
  completed: z.record(z.string(), z.array(z.string())).default({}),
  responses: z.array(z.unknown()).default([]),
  uploads: z.record(z.string(), z.string()).default({}),
});
type Checkpoint = z.infer<typeof checkpointSchema>;
const batchSize = 50;

export type ApplyOptions = {
  outputDir: string;
  workspaceId: string;
  transport: ImportTransport;
  batchSize?: number;
  destinationKey?: string;
  resolveDestinationIssueIds?: (
    sourceIssueIds: string[],
  ) => Promise<ReadonlyMap<string, string>>;
};
export type ApplyResult = {
  runId: string;
  completed: number;
  skipped: number;
  responses: unknown[];
};

export async function applyImport(options: ApplyOptions): Promise<ApplyResult> {
  const loaded = await readExport(options.outputDir);
  const destinationKey = options.destinationKey ?? options.workspaceId;
  const checkpoint = await loadCheckpoint(loaded, destinationKey);
  const completed = new Set(
    Object.entries(checkpoint.completed).flatMap(([kind, ids]) =>
      ids.map((id) => `${kind}:${id}`),
    ),
  );
  const responses = [...checkpoint.responses];
  let applied = 0;
  let skipped = 0;
  let destinationIssueIds: ReadonlyMap<string, string> | undefined;
  for (const kind of importKinds) {
    const records = orderedRecords(loaded, kind);
    for (const batch of batches(records, options.batchSize ?? batchSize)) {
      const pending = batch.filter(
        (record) => !completed.has(`${kind}:${record.summary.sourceId}`),
      );
      skipped += batch.length - pending.length;
      if (!pending.length) continue;
      if (kind === 'attachment' && !destinationIssueIds)
        destinationIssueIds = await resolveDestinationIssues(options, loaded);
      const body = await makeBatch(
        loaded,
        kind,
        pending,
        options,
        destinationIssueIds ?? new Map(),
        checkpoint,
      );
      const response = await options.transport.request(
        `/workspaces/${encodeURIComponent(options.workspaceId)}/imports`,
        z.unknown(),
        { method: 'POST', body, operationId: randomUUID() },
      );
      responses.push(response);
      for (const record of pending) {
        completed.add(`${kind}:${record.summary.sourceId}`);
        applied += 1;
      }
      checkpoint.completed[kind] = [
        ...(checkpoint.completed[kind] ?? []),
        ...pending.map((record) => record.summary.sourceId),
      ];
      checkpoint.responses = responses;
      await writePrivateJson(join(options.outputDir, 'apply.json'), checkpoint);
    }
  }
  return {
    runId: loaded.manifest.runId,
    completed: applied,
    skipped,
    responses,
  };
}

function orderedRecords(
  loaded: LoadedExport,
  kind: ImportKind,
): LoadedRecord[] {
  const records = loaded.records.filter(
    (record) => record.summary.kind === kind,
  );
  if (kind !== 'issue') return records;
  const byId = new Map(
    records.map((record) => [record.summary.sourceId, record]),
  );
  const depths = new Map<string, number>();
  const depth = (record: LoadedRecord, visiting: Set<string>): number => {
    const sourceId = record.summary.sourceId;
    const cached = depths.get(sourceId);
    if (cached !== undefined) return cached;
    if (visiting.has(sourceId)) return 0;
    visiting.add(sourceId);
    const parentId = stringValue(nestedRecord(record.payload, 'parent')?.id);
    const parent = parentId ? byId.get(parentId) : undefined;
    const value = parent ? depth(parent, visiting) + 1 : 0;
    visiting.delete(sourceId);
    depths.set(sourceId, value);
    return value;
  };
  return [...records].sort(
    (left, right) =>
      depth(left, new Set()) - depth(right, new Set()) ||
      left.summary.sourceId.localeCompare(right.summary.sourceId),
  );
}

async function makeBatch(
  loaded: LoadedExport,
  kind: ImportKind,
  records: LoadedRecord[],
  options: ApplyOptions,
  destinationIssueIds: ReadonlyMap<string, string>,
  checkpoint: Checkpoint,
): Promise<ImportBatch> {
  const items: ImportBatchItem[] = [];
  for (const record of records) {
    const identity = sourceIdentity(record.payload);
    const item: ImportBatchItem = {
      sourceId: record.summary.sourceId,
      sourceRevision: record.summary.sourceRevision,
      payload: record.payload,
      ...(identity ? { sourceIdentity: identity } : {}),
    };
    if (kind === 'attachment')
      item.file = await prepareAttachmentFile(
        loaded,
        record,
        options,
        destinationIssueIds,
        checkpoint,
      );
    items.push(item);
  }
  return {
    runId: loaded.manifest.runId,
    provider: 'linear',
    sourceWorkspaceId: loaded.manifest.sourceWorkspaceId,
    kind,
    items,
  };
}

async function resolveDestinationIssues(
  options: ApplyOptions,
  loaded: LoadedExport,
): Promise<ReadonlyMap<string, string>> {
  if (!options.resolveDestinationIssueIds) return new Map();
  const sourceIssueIds = loaded.records
    .filter((record) => record.summary.kind === 'attachment')
    .map((record) => stringValue(asRecord(record.payload)?.issueId))
    .filter((value): value is string => value !== undefined);
  return options.resolveDestinationIssueIds([...new Set(sourceIssueIds)]);
}

async function prepareAttachmentFile(
  loaded: LoadedExport,
  record: LoadedRecord,
  options: ApplyOptions,
  destinationIssueIds: ReadonlyMap<string, string>,
  checkpoint: Checkpoint,
): Promise<FileSummary | undefined> {
  const file = loaded.manifest.files.find(
    (candidate) => candidate.sourceId === record.summary.sourceId,
  );
  if (!file || file.state !== 'ready' || !file.localFile) return file;
  const sourceIssueId = stringValue(asRecord(record.payload)?.issueId);
  const destinationIssueId = sourceIssueId
    ? destinationIssueIds.get(sourceIssueId)
    : undefined;
  if (!destinationIssueId)
    throw new Error(
      `Attachment ${record.summary.sourceId} has no destination issue mapping.`,
    );
  const previousUrl = checkpoint.uploads[record.summary.sourceId];
  if (previousUrl) return { ...file, destinationUrl: previousUrl };
  if (!options.transport.uploadFile)
    throw new Error('The configured transport cannot upload attachment files.');
  const path = join(loaded.outputDir, file.localFile);
  if (!isPrivateRelativePath(loaded.outputDir, path))
    throw new Error(
      `Attachment file escapes export directory: ${file.localFile}`,
    );
  const bytes = await readFile(path);
  const content = new Blob([bytes], {
    type: file.contentType ?? 'application/octet-stream',
  });
  const upload = await options.transport.uploadFile(
    options.workspaceId,
    destinationIssueId,
    content,
  );
  checkpoint.uploads[record.summary.sourceId] = upload.url;
  await writePrivateJson(join(loaded.outputDir, 'apply.json'), checkpoint);
  return { ...file, destinationUrl: upload.url };
}

function batches(records: LoadedRecord[], size: number): LoadedRecord[][] {
  const result: LoadedRecord[][] = [];
  for (let index = 0; index < records.length; index += size)
    result.push(records.slice(index, index + size));
  return result;
}

async function loadCheckpoint(
  loaded: LoadedExport,
  destinationKey: string,
): Promise<Checkpoint> {
  try {
    const checkpoint = checkpointSchema.parse(
      await readJson(join(loaded.outputDir, 'apply.json')),
    );
    if (checkpoint.manifestRunId !== loaded.manifest.runId)
      throw new Error('apply.json belongs to a different export run.');
    if (checkpoint.destinationKey !== destinationKey)
      throw new Error('apply.json belongs to a different destination.');
    return checkpoint;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return {
        manifestRunId: loaded.manifest.runId,
        destinationKey,
        completed: {},
        responses: [],
        uploads: {},
      };
    throw error;
  }
}

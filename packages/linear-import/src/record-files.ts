import { join } from 'node:path';
import {
  downloadLinearFile,
  isExternalLink,
  writePrivateJson,
} from './files.ts';
import {
  asRecord,
  hashJson,
  sourceRevision,
  stringValue,
  type ExportOptions,
  type FileSummary,
  type ImportKind,
  type RecordSummary,
} from './model.ts';

export type StoredRecord = {
  kind: ImportKind;
  sourceId: string;
  sourceRevision: string;
  payload: unknown;
  sourceUrl?: string;
};

export function addRecord(
  records: Map<string, StoredRecord>,
  kind: ImportKind,
  payload: unknown,
  sourceUrl?: string,
): void {
  const sourceId = stringValue(asRecord(payload)?.id);
  if (!sourceId) return;
  const key = `${kind}:${sourceId}`;
  if (records.has(key)) return;
  records.set(key, {
    kind,
    sourceId,
    sourceRevision: sourceRevision(payload),
    payload,
    ...(sourceUrl ? { sourceUrl } : {}),
  });
}

export async function collectFiles(
  options: ExportOptions,
  records: Map<string, StoredRecord>,
  missing: string[],
): Promise<FileSummary[]> {
  const files: FileSummary[] = [];
  for (const record of records.values()) {
    if (record.kind !== 'attachment' || !record.sourceUrl) continue;
    if (isExternalLink(record.sourceUrl)) {
      files.push({
        sourceId: record.sourceId,
        sourceUrl: record.sourceUrl,
        state: 'external',
        reason: 'external link',
      });
      continue;
    }
    if (!options.downloadFiles) {
      files.push({
        sourceId: record.sourceId,
        sourceUrl: record.sourceUrl,
        state: 'missing',
        reason: 'download disabled',
      });
      missing.push(`attachment ${record.sourceId}: download disabled`);
      continue;
    }
    const result = await downloadLinearFile(
      options.outputDir,
      record.sourceId,
      record.sourceUrl,
    );
    files.push(result);
    if (result.state === 'missing')
      missing.push(
        `attachment ${record.sourceId}: ${result.reason ?? 'missing'}`,
      );
  }
  return files;
}

export async function writeRecords(
  outputDir: string,
  records: Map<string, StoredRecord>,
): Promise<RecordSummary[]> {
  const summaries: RecordSummary[] = [];
  const ordered = [...records.values()].sort((left, right) =>
    `${left.kind}:${left.sourceId}`.localeCompare(
      `${right.kind}:${right.sourceId}`,
    ),
  );
  for (const record of ordered) {
    const json = hashJson(record.payload);
    const rawFile = `records/${record.kind}/${encodeURIComponent(record.sourceId).replace(/%/gu, '_')}.json`;
    await writePrivateJson(join(outputDir, rawFile), record.payload);
    summaries.push({
      kind: record.kind,
      sourceId: record.sourceId,
      sourceRevision: record.sourceRevision,
      payloadHash: json.hash,
      rawFile,
      ...(stringValue(record.sourceUrl) ? { sourceUrl: record.sourceUrl } : {}),
    });
  }
  return summaries;
}

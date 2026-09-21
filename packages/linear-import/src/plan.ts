import { join } from 'node:path';
import { readJson } from './files.ts';
import {
  manifestSchema,
  asRecord,
  importKinds,
  nestedRecord,
  stringValue,
  type ImportKind,
  type ImportPlan,
  type Manifest,
  type RecordSummary,
} from './model.ts';

export type LoadedRecord = { summary: RecordSummary; payload: unknown };
export type LoadedExport = {
  outputDir: string;
  manifest: Manifest;
  records: LoadedRecord[];
};

export async function readExport(outputDir: string): Promise<LoadedExport> {
  const manifest = manifestSchema.parse(
    await readJson(join(outputDir, 'manifest.json')),
  );
  const records: LoadedRecord[] = [];
  for (const summary of manifest.records) {
    const payload = await readJson(join(outputDir, summary.rawFile));
    const sourceId = stringValue(asRecord(payload)?.id);
    if (sourceId !== summary.sourceId)
      throw new Error(`Source ID mismatch in ${summary.rawFile}.`);
    records.push({ summary, payload });
  }
  return { outputDir, manifest, records };
}

export async function buildImportPlan(outputDir: string): Promise<ImportPlan> {
  const loaded = await readExport(outputDir);
  const counts = Object.fromEntries(
    importKinds.map((kind) => [kind, 0]),
  ) as Record<ImportKind, number>;
  const sourceIds = new Set(
    loaded.manifest.records.map(
      (record) => `${record.kind}:${record.sourceId}`,
    ),
  );
  const unresolved = [...loaded.manifest.missing];
  const warnings: string[] = [];
  for (const record of loaded.records) {
    counts[record.summary.kind] += 1;
    collectReferenceWarnings(
      record.summary.kind,
      record.payload,
      sourceIds,
      unresolved,
      warnings,
    );
  }
  for (const file of loaded.manifest.files)
    if (file.state === 'missing')
      unresolved.push(`file ${file.sourceId}: ${file.reason ?? 'missing'}`);
  return {
    manifest: loaded.manifest,
    counts,
    unresolved: [...new Set(unresolved)].sort(),
    warnings: [...new Set(warnings)].sort(),
  };
}

function collectReferenceWarnings(
  kind: ImportKind,
  payload: unknown,
  sourceIds: Set<string>,
  unresolved: string[],
  warnings: string[],
): void {
  if (kind === 'comment')
    collectCommentWarnings(payload, sourceIds, unresolved);
  if (kind === 'relation')
    collectRelationWarnings(payload, sourceIds, unresolved);
  if (kind === 'issue')
    collectIssueWarnings(payload, sourceIds, unresolved, warnings);
}

function collectCommentWarnings(
  payload: unknown,
  sourceIds: Set<string>,
  unresolved: string[],
): void {
  const record = asRecord(payload);
  if (!record) return;
  const issueId =
    stringValue(record.issueId) ??
    stringValue(nestedRecord(record, 'issue')?.id);
  if (issueId && !sourceIds.has(`issue:${issueId}`))
    unresolved.push(
      `comment ${stringValue(record.id) ?? 'unknown'} references issue ${issueId}`,
    );
}

function collectRelationWarnings(
  payload: unknown,
  sourceIds: Set<string>,
  unresolved: string[],
): void {
  const record = asRecord(payload);
  if (!record) return;
  for (const key of ['issue', 'relatedIssue']) {
    const target = stringValue(nestedRecord(record, key)?.id);
    if (target && !sourceIds.has(`issue:${target}`))
      unresolved.push(
        `relation ${stringValue(record.id) ?? 'unknown'} references issue ${target}`,
      );
  }
}

function collectIssueWarnings(
  payload: unknown,
  sourceIds: Set<string>,
  unresolved: string[],
  warnings: string[],
): void {
  const record = asRecord(payload);
  if (!record) return;
  const issueName =
    stringValue(record.identifier) ?? stringValue(record.id) ?? 'unknown';
  const parentId = stringValue(nestedRecord(record, 'parent')?.id);
  if (parentId && !sourceIds.has(`issue:${parentId}`))
    unresolved.push(`issue ${issueName} references missing parent ${parentId}`);
  const assignee = nestedRecord(record, 'assignee');
  if (assignee && !stringValue(assignee.id))
    warnings.push(`issue ${issueName} has an assignee without a source ID`);
}

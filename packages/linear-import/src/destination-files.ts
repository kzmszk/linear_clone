import {
  asRecord,
  hashBytes,
  type FileSummary,
  type ImportTransport,
} from './model.ts';
import type { LoadedExport } from './plan.ts';
import type { DestinationFile, Mapping } from './destination-schema.ts';
import { compareAttachmentRecords } from './destination-attachments.ts';
import {
  destinationIdForSource,
  messageOf,
  sourceRef,
} from './destination-values.ts';

export function sourceUrlReplacements(
  files: DestinationFile[] | undefined,
): Map<string, string> {
  const replacements = new Map<string, string>();
  for (const file of files ?? [])
    if (file.sourceUrl && file.url && file.sourceUrl !== file.url)
      replacements.set(file.sourceUrl, file.url);
  return replacements;
}

export async function compareFiles(
  loaded: LoadedExport,
  workspaceId: string,
  files: DestinationFile[] | undefined,
  mappings: Map<string, Mapping>,
  transport: ImportTransport,
  mismatches: string[],
  unsupported: string[],
): Promise<boolean> {
  const expected = loaded.manifest.files.filter(
    (file) => file.state !== 'missing',
  );
  if (!files) {
    if (!expected.length) return true;
    if (loaded.records.some((record) => record.summary.kind === 'attachment'))
      unsupported.push(
        'destination attachment records are not exposed by the verify endpoint',
      );
    unsupported.push(
      'destination attachment files are not exposed by the verify endpoint',
    );
    return false;
  }
  let matches = await compareAttachmentRecords(
    loaded,
    workspaceId,
    files,
    mappings,
    transport,
    mismatches,
  );
  for (const file of expected) {
    const actual = files.find(
      (candidate) => candidate.sourceId === file.sourceId,
    );
    if (!actual) {
      mismatches.push(`destination file missing: ${file.sourceId}`);
      matches = false;
      continue;
    }
    if (
      !(await compareFile(
        file,
        actual,
        loaded,
        mappings,
        transport,
        mismatches,
        unsupported,
      ))
    )
      matches = false;
  }
  return matches;
}

async function compareFile(
  source: FileSummary,
  target: DestinationFile,
  loaded: LoadedExport,
  mappings: Map<string, Mapping>,
  transport: ImportTransport,
  mismatches: string[],
  unsupported: string[],
): Promise<boolean> {
  const metadataMatch = compareFileMetadata(
    source,
    target,
    loaded,
    mappings,
    mismatches,
  );
  if (source.state === 'external') return metadataMatch;
  if (!target.url) {
    mismatches.push(`destination file URL missing: ${source.sourceId}`);
    return false;
  }
  if (!transport.downloadFile) {
    unsupported.push(
      'destination file bytes cannot be downloaded by this transport',
    );
    return false;
  }
  const bytesMatch = await compareDownloadedFile(
    source,
    target.url,
    transport,
    mismatches,
  );
  return metadataMatch && bytesMatch;
}

function compareFileMetadata(
  source: FileSummary,
  target: DestinationFile,
  loaded: LoadedExport,
  mappings: Map<string, Mapping>,
  mismatches: string[],
): boolean {
  let matches = compareFileReferences(
    source,
    target,
    loaded,
    mappings,
    mismatches,
  );
  if (source.state === 'external')
    return compareExternalFile(source, target, mismatches) && matches;
  matches = compareFileProperties(source, target, mismatches) && matches;
  return matches;
}

function compareFileReferences(
  source: FileSummary,
  target: DestinationFile,
  loaded: LoadedExport,
  mappings: Map<string, Mapping>,
  mismatches: string[],
): boolean {
  let matches = true;
  if (target.sourceUrl !== undefined && target.sourceUrl !== source.sourceUrl) {
    mismatches.push(`destination file URL differs: ${source.sourceId}`);
    matches = false;
  }
  const record = loaded.records.find(
    (item) =>
      item.summary.sourceId === source.sourceId &&
      item.summary.kind === 'attachment',
  );
  const issueSourceId = record
    ? sourceRef(asRecord(record.payload), 'issue')
    : undefined;
  const expectedIssueId = issueSourceId
    ? destinationIdForSource(mappings, 'issue', issueSourceId)
    : undefined;
  if (
    expectedIssueId !== undefined &&
    target.issueId !== undefined &&
    target.issueId !== expectedIssueId
  ) {
    mismatches.push(`destination file issue differs: ${source.sourceId}`);
    matches = false;
  }
  return matches;
}

function compareExternalFile(
  source: FileSummary,
  target: DestinationFile,
  mismatches: string[],
): boolean {
  const actualUrl = target.url ?? target.sourceUrl;
  if (actualUrl === source.sourceUrl) return true;
  mismatches.push(`external attachment URL differs: ${source.sourceId}`);
  return false;
}

function compareFileProperties(
  source: FileSummary,
  target: DestinationFile,
  mismatches: string[],
): boolean {
  let matches = true;
  if (source.checksum && target.checksum !== source.checksum) {
    mismatches.push(`destination file checksum differs: ${source.sourceId}`);
    matches = false;
  }
  if (source.size !== undefined && target.size !== source.size) {
    mismatches.push(`destination file size differs: ${source.sourceId}`);
    matches = false;
  }
  if (
    source.contentType &&
    target.contentType &&
    target.contentType !== source.contentType
  ) {
    mismatches.push(
      `destination file content type differs: ${source.sourceId}`,
    );
    matches = false;
  }
  if (!target.url) {
    return false;
  }
  return matches;
}

async function compareDownloadedFile(
  source: FileSummary,
  url: string,
  transport: ImportTransport,
  mismatches: string[],
): Promise<boolean> {
  try {
    const downloaded = await transport.downloadFile?.(url);
    if (!downloaded) return false;
    let matches = true;
    if (source.checksum && hashBytes(downloaded.bytes) !== source.checksum) {
      mismatches.push(`destination file bytes differ: ${source.sourceId}`);
      matches = false;
    }
    if (
      source.size !== undefined &&
      downloaded.bytes.byteLength !== source.size
    ) {
      mismatches.push(`destination file byte size differs: ${source.sourceId}`);
      matches = false;
    }
    if (
      source.contentType &&
      downloaded.contentType &&
      downloaded.contentType !== source.contentType
    ) {
      mismatches.push(
        `destination downloaded content type differs: ${source.sourceId}`,
      );
      matches = false;
    }
    return matches;
  } catch (error) {
    mismatches.push(
      `destination file download failed: ${source.sourceId} (${messageOf(error)})`,
    );
    return false;
  }
}

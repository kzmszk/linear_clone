import { z } from 'zod';
import { asRecord, stringValue, type ImportTransport } from './model.ts';
import type { LoadedExport, LoadedRecord } from './plan.ts';
import type { DestinationFile, Mapping } from './destination-schema.ts';
import {
  destinationIdForSource,
  mappingKey,
  messageOf,
  sourceRef,
} from './destination-values.ts';

const attachmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  contentType: z.string().nullable(),
});
type Attachment = z.infer<typeof attachmentSchema>;

export async function compareAttachmentRecords(
  loaded: LoadedExport,
  workspaceId: string,
  files: DestinationFile[],
  mappings: Map<string, Mapping>,
  transport: ImportTransport,
  mismatches: string[],
): Promise<boolean> {
  const groups = attachmentGroups(loaded.records);
  let matches = true;
  for (const [sourceIssueId, records] of groups) {
    const destinationIssueId = destinationIdForSource(
      mappings,
      'issue',
      sourceIssueId,
    );
    if (!destinationIssueId) {
      mismatches.push(`attachment source issue missing: ${sourceIssueId}`);
      matches = false;
      continue;
    }
    const actual = await fetchAttachments(
      workspaceId,
      destinationIssueId,
      transport,
      mismatches,
    );
    if (!actual) {
      matches = false;
      continue;
    }
    for (const record of records) {
      const source = loaded.manifest.files.find(
        (file) => file.sourceId === record.summary.sourceId,
      );
      const target = files.find(
        (file) => file.sourceId === record.summary.sourceId,
      );
      if (
        !compareAttachment(record, source, target, actual, mappings, mismatches)
      )
        matches = false;
    }
  }
  return matches;
}

function attachmentGroups(
  records: LoadedRecord[],
): Map<string, LoadedRecord[]> {
  const groups = new Map<string, LoadedRecord[]>();
  for (const record of records) {
    if (record.summary.kind !== 'attachment') continue;
    const issueId = attachmentIssueId(record);
    if (issueId) groups.set(issueId, [...(groups.get(issueId) ?? []), record]);
  }
  return groups;
}

function attachmentIssueId(record: LoadedRecord): string | undefined {
  const payload = asRecord(record.payload);
  return (
    stringValue(payload?.issueId) ?? sourceRef(payload, 'issue') ?? undefined
  );
}

async function fetchAttachments(
  workspaceId: string,
  destinationIssueId: string,
  transport: ImportTransport,
  mismatches: string[],
): Promise<Attachment[] | undefined> {
  try {
    return await transport.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/issues/${encodeURIComponent(destinationIssueId)}/attachments?includeArchived=true`,
      z.array(attachmentSchema),
    );
  } catch (error) {
    mismatches.push(
      `destination attachment request failed: ${messageOf(error)}`,
    );
    return undefined;
  }
}

function compareAttachment(
  record: LoadedRecord,
  source: DestinationFile | undefined,
  targetFile: DestinationFile | undefined,
  actual: Attachment[],
  mappings: Map<string, Mapping>,
  mismatches: string[],
): boolean {
  const mapping = mappings.get(
    mappingKey(
      'attachment',
      record.summary.sourceId,
      record.summary.sourceRevision,
    ),
  );
  if (!mapping?.destinationId) {
    mismatches.push(
      `destination attachment ID missing: ${record.summary.sourceId}`,
    );
    return false;
  }
  const attachment = actual.find((item) => item.id === mapping.destinationId);
  if (!attachment) {
    mismatches.push(
      `destination attachment missing: ${record.summary.sourceId}`,
    );
    return false;
  }
  const expected = expectedAttachment(record, source, targetFile);
  return compareAttachmentProperties(
    record.summary.sourceId,
    attachment,
    expected,
    mismatches,
  );
}

function expectedAttachment(
  record: LoadedRecord,
  source: DestinationFile | undefined,
  targetFile: DestinationFile | undefined,
): {
  title: string;
  url: string | undefined;
  contentType: string | undefined;
} {
  const payload = asRecord(record.payload);
  return {
    title:
      stringValue(payload?.title) ??
      stringValue(payload?.subtitle) ??
      record.summary.sourceId,
    url: targetFile?.url ?? stringValue(payload?.url) ?? source?.sourceUrl,
    contentType: targetFile?.contentType ?? undefined,
  };
}

function compareAttachmentProperties(
  sourceId: string,
  actual: Attachment,
  expected: {
    title: string;
    url: string | undefined;
    contentType: string | undefined;
  },
  mismatches: string[],
): boolean {
  let matches = true;
  if (actual.title !== expected.title) {
    mismatches.push(`destination attachment title differs: ${sourceId}`);
    matches = false;
  }
  if (expected.url && actual.url !== expected.url) {
    mismatches.push(`destination attachment URL differs: ${sourceId}`);
    matches = false;
  }
  if (expected.contentType && actual.contentType !== expected.contentType) {
    mismatches.push(`destination attachment content type differs: ${sourceId}`);
    matches = false;
  }
  return matches;
}

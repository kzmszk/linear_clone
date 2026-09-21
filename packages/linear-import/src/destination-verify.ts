import type { ImportTransport } from './model.ts';
import type { LoadedExport } from './plan.ts';
import {
  type DestinationChecks,
  type DestinationVerify,
  type Mapping,
} from './destination-schema.ts';
import { verifyMetadata } from './destination-metadata.ts';
import { compareComments, compareHistories } from './destination-children.ts';
import { verifyIssues } from './destination-issues.ts';
import { compareRelations } from './destination-relations.ts';
import { compareFiles, sourceUrlReplacements } from './destination-files.ts';
import { mappingKey } from './destination-values.ts';

export async function verifyDestination(
  loaded: LoadedExport,
  workspaceId: string,
  destination: DestinationVerify,
  transport: ImportTransport,
): Promise<DestinationChecks> {
  const mismatches: string[] = [];
  const unsupported: string[] = [];
  const mappings = mappingMap(destination.mappings);
  const replacements = sourceUrlReplacements(destination.files);
  const countsMatch = compareCounts(loaded, destination, mismatches);
  const mappingsMatch = compareMappings(loaded, mappings, mismatches);
  const issueRecords = recordsOf(loaded, 'issue');
  const issueTargets = await verifyIssues(
    issueRecords,
    loaded,
    workspaceId,
    mappings,
    replacements,
    transport,
    mismatches,
  );
  const metadataMatch = await verifyMetadata(
    loaded,
    workspaceId,
    mappings,
    transport,
    mismatches,
  );
  const childrenMatch = await verifyIssueChildren(
    loaded,
    issueTargets,
    mappings,
    replacements,
    workspaceId,
    transport,
    mismatches,
  );
  const referencesMatch = await compareRelations(
    loaded,
    mappings,
    workspaceId,
    transport,
    mismatches,
  );
  const filesMatch = await compareFiles(
    loaded,
    workspaceId,
    destination.files,
    mappings,
    transport,
    mismatches,
    unsupported,
  );
  if (destination.unresolved.length)
    mismatches.push(
      `destination has unresolved records: ${destination.unresolved.join(', ')}`,
    );
  return {
    mismatches,
    unsupported,
    summary: {
      countsMatch,
      mappingsMatch,
      entitiesMatch:
        metadataMatch &&
        issueTargets.size === issueRecords.length &&
        childrenMatch,
      referencesMatch,
      filesMatch,
    },
  };
}

type IssueTargets = Awaited<ReturnType<typeof verifyIssues>>;

async function verifyIssueChildren(
  loaded: LoadedExport,
  targets: IssueTargets,
  mappings: Map<string, Mapping>,
  replacements: Map<string, string>,
  workspaceId: string,
  transport: ImportTransport,
  mismatches: string[],
): Promise<boolean> {
  const commentsMatch = await compareComments(
    recordsOf(loaded, 'comment'),
    targets,
    mappings,
    replacements,
    workspaceId,
    transport,
    mismatches,
  );
  const historiesMatch = await compareHistories(
    recordsOf(loaded, 'history'),
    targets,
    mappings,
    replacements,
    workspaceId,
    transport,
    mismatches,
  );
  return commentsMatch && historiesMatch;
}

function recordsOf(loaded: LoadedExport, kind: string) {
  return loaded.records.filter((record) => record.summary.kind === kind);
}

function mappingMap(mappings: Mapping[]): Map<string, Mapping> {
  return new Map(
    mappings.map((mapping) => [
      mappingKey(mapping.kind, mapping.sourceId, mapping.sourceRevision),
      mapping,
    ]),
  );
}

function compareCounts(
  loaded: LoadedExport,
  destination: DestinationVerify,
  mismatches: string[],
): boolean {
  const expected: Record<string, number> = {};
  for (const record of loaded.manifest.records)
    expected[record.kind] = (expected[record.kind] ?? 0) + 1;
  let matches = destination.records === loaded.manifest.records.length;
  for (const [kind, count] of Object.entries(expected))
    if (destination.kinds[kind] !== count) matches = false;
  if (!matches)
    mismatches.push('destination record counts do not match the manifest');
  return matches;
}

function compareMappings(
  loaded: LoadedExport,
  mappings: Map<string, Mapping>,
  mismatches: string[],
): boolean {
  let matches = true;
  for (const summary of loaded.manifest.records) {
    const actual = mappings.get(
      mappingKey(summary.kind, summary.sourceId, summary.sourceRevision),
    );
    if (!actual) {
      mismatches.push(
        `destination mapping missing: ${summary.kind}:${summary.sourceId}`,
      );
      matches = false;
      continue;
    }
    if (actual.payloadHash !== summary.payloadHash) {
      mismatches.push(
        `destination hash mismatch: ${summary.kind}:${summary.sourceId}`,
      );
      matches = false;
    }
    if (summary.kind !== 'member' && actual.destinationId === null) {
      mismatches.push(
        `destination ID missing: ${summary.kind}:${summary.sourceId}`,
      );
      matches = false;
    }
  }
  return matches;
}

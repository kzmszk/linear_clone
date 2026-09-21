import { metadataSchema, type Metadata } from '../../contracts/src/index.ts';
import {
  asRecord,
  stringValue,
  type ImportKind,
  type ImportTransport,
} from './model.ts';
import type { LoadedExport, LoadedRecord } from './plan.ts';
import type { Mapping } from './destination-schema.ts';
import {
  destinationId,
  mappingKey,
  messageOf,
  nestedIds,
  sameSet,
  sourceRef,
} from './destination-values.ts';

export async function verifyMetadata(
  loaded: LoadedExport,
  workspaceId: string,
  mappings: Map<string, Mapping>,
  transport: ImportTransport,
  mismatches: string[],
): Promise<boolean> {
  const metadata = await fetchMetadata(workspaceId, transport, mismatches);
  return (
    metadata !== undefined &&
    compareMetadata(loaded, mappings, metadata, mismatches)
  );
}

async function fetchMetadata(
  workspaceId: string,
  transport: ImportTransport,
  mismatches: string[],
): Promise<Metadata | undefined> {
  try {
    return await transport.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/metadata`,
      metadataSchema,
    );
  } catch (error) {
    mismatches.push(`destination metadata request failed: ${messageOf(error)}`);
    return undefined;
  }
}

function compareMetadata(
  loaded: LoadedExport,
  mappings: Map<string, Mapping>,
  metadata: Metadata,
  mismatches: string[],
): boolean {
  const records = new Map<string, unknown>();
  for (const kind of ['team', 'state', 'label', 'project', 'member'] as const) {
    const values = metadataValues(metadata, kind);
    for (const value of values) {
      const id = stringValue(asRecord(value)?.id);
      if (id) records.set(`${kind}:${id}`, value);
    }
  }
  let matches = true;
  for (const record of loaded.records) {
    if (
      !['team', 'state', 'label', 'project', 'member'].includes(
        record.summary.kind,
      )
    )
      continue;
    const mapping = mappings.get(
      mappingKey(
        record.summary.kind,
        record.summary.sourceId,
        record.summary.sourceRevision,
      ),
    );
    if (!mapping?.destinationId) continue;
    const target = records.get(
      `${record.summary.kind}:${mapping.destinationId}`,
    );
    if (!target) {
      mismatches.push(
        `destination ${record.summary.kind} missing: ${record.summary.sourceId}`,
      );
      matches = false;
      continue;
    }
    if (
      !compareMetadataRecord(
        record,
        record.summary.kind,
        target,
        loaded,
        mappings,
        mismatches,
      )
    )
      matches = false;
  }
  return matches;
}

function metadataValues(
  metadata: Metadata,
  kind: 'team' | 'state' | 'label' | 'project' | 'member',
): unknown[] {
  switch (kind) {
    case 'team':
      return metadata.teams;
    case 'state':
      return metadata.states;
    case 'label':
      return metadata.labels;
    case 'project':
      return metadata.projects;
    case 'member':
      return metadata.members;
  }
}

function compareMetadataRecord(
  source: LoadedRecord,
  kind: ImportKind,
  target: unknown,
  loaded: LoadedExport,
  mappings: Map<string, Mapping>,
  mismatches: string[],
): boolean {
  const sourceValue = asRecord(source.payload);
  const targetValue = asRecord(target);
  if (!sourceValue || !targetValue) return false;
  return (
    compareBasicFields(source, kind, sourceValue, targetValue, mismatches) &&
    (kind !== 'project' ||
      compareProjectFields(
        source,
        sourceValue,
        targetValue,
        loaded,
        mappings,
        mismatches,
      )) &&
    (kind !== 'state' ||
      compareStateFields(
        source,
        sourceValue,
        targetValue,
        loaded,
        mappings,
        mismatches,
      ))
  );
}

function compareBasicFields(
  source: LoadedRecord,
  kind: ImportKind,
  sourceValue: Record<string, unknown>,
  targetValue: Record<string, unknown>,
  mismatches: string[],
): boolean {
  let matches = true;
  for (const field of [
    'name',
    'key',
    'email',
    'color',
    'type',
    'position',
  ] as const) {
    if (field in sourceValue && sourceValue[field] !== targetValue[field]) {
      mismatches.push(
        `destination ${kind}:${source.summary.sourceId} field ${field} differs`,
      );
      matches = false;
    }
  }
  return matches;
}

function compareProjectFields(
  source: LoadedRecord,
  sourceValue: Record<string, unknown>,
  targetValue: Record<string, unknown>,
  loaded: LoadedExport,
  mappings: Map<string, Mapping>,
  mismatches: string[],
): boolean {
  let matches = true;
  const status =
    stringValue(asRecord(sourceValue.status)?.name) ??
    stringValue(sourceValue.status);
  if (status !== undefined && status !== targetValue.status) {
    mismatches.push(
      `destination project:${source.summary.sourceId} status differs`,
    );
    matches = false;
  }
  if (
    'description' in sourceValue &&
    sourceValue.description !== targetValue.description
  ) {
    mismatches.push(
      `destination project:${source.summary.sourceId} description differs`,
    );
    matches = false;
  }
  const expectedTeams = nestedIds(sourceValue, 'teams').map((id) =>
    destinationId(loaded, mappings, 'team', id),
  );
  if (expectedTeams.every((id): id is string => id !== undefined)) {
    const actualTeams = Array.isArray(targetValue.teamIds)
      ? targetValue.teamIds
      : [];
    if (!sameSet(expectedTeams, actualTeams)) {
      mismatches.push(
        `destination project:${source.summary.sourceId} teams differ`,
      );
      matches = false;
    }
  }
  return matches;
}

function compareStateFields(
  source: LoadedRecord,
  sourceValue: Record<string, unknown>,
  targetValue: Record<string, unknown>,
  loaded: LoadedExport,
  mappings: Map<string, Mapping>,
  mismatches: string[],
): boolean {
  const team = sourceRef(sourceValue, 'team');
  const expectedTeam =
    team === undefined || team === null
      ? team
      : destinationId(loaded, mappings, 'team', team);
  if (expectedTeam === undefined || targetValue.teamId === expectedTeam)
    return true;
  mismatches.push(`destination state:${source.summary.sourceId} team differs`);
  return false;
}

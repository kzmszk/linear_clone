import { asRecord, nestedRecord, stringValue } from './model.ts';
import type { LoadedExport, LoadedRecord } from './plan.ts';
import type { Mapping } from './destination-schema.ts';

export function mappingKey(
  kind: string,
  sourceId: string,
  revision: string,
): string {
  return `${kind}:${sourceId}:${revision}`;
}

export function compareProperty(
  source: LoadedRecord,
  field: string,
  expected: unknown,
  actual: unknown,
  mismatches: string[],
): boolean {
  if (
    expected === undefined ||
    expected === actual ||
    (Array.isArray(expected) &&
      Array.isArray(actual) &&
      sameArray(expected, actual))
  )
    return true;
  mismatches.push(
    `destination ${source.summary.kind}:${source.summary.sourceId} field ${field} differs`,
  );
  return false;
}

function sameArray(left: unknown[], right: unknown[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function sourceRef(
  value: unknown,
  key: string,
): string | null | undefined {
  const record = asRecord(value);
  if (!record || !(key in record)) return undefined;
  if (record[key] === null) return null;
  return (
    stringValue(record[key]) ??
    stringValue(nestedRecord(record, key)?.id) ??
    null
  );
}

export function replaceSourceUrls(
  value: string,
  replacements: Map<string, string>,
): string {
  let result = value;
  for (const [source, destination] of replacements)
    result = result.split(source).join(destination);
  return result;
}

export function nestedIds(value: unknown, key: string): string[] {
  const nested = asRecord(value)?.[key];
  const nodes = asRecord(nested)?.nodes ?? nested;
  if (!Array.isArray(nodes)) return [];
  return nodes.flatMap((item) => {
    const id =
      typeof item === 'string' ? item : stringValue(asRecord(item)?.id);
    return id ? [id] : [];
  });
}

export function sourceName(
  value: unknown,
  key: string,
): string | null | undefined {
  const record = asRecord(value);
  if (!record || !(key in record)) return undefined;
  if (record[key] === null) return null;
  const nested = nestedRecord(record, key);
  return stringValue(nested?.name) ?? stringValue(nested?.displayName) ?? null;
}

export function destinationId(
  loaded: LoadedExport,
  mappings: Map<string, Mapping>,
  kind: string,
  sourceId: string,
): string | undefined {
  const summary = loaded.manifest.records.find(
    (record) => record.kind === kind && record.sourceId === sourceId,
  );
  if (!summary) return undefined;
  return (
    mappings.get(mappingKey(kind, sourceId, summary.sourceRevision))
      ?.destinationId ?? undefined
  );
}

export function destinationIdForSource(
  mappings: Map<string, Mapping>,
  kind: string,
  sourceId: string,
): string | null {
  for (const mapping of mappings.values())
    if (mapping.kind === kind && mapping.sourceId === sourceId)
      return mapping.destinationId;
  return null;
}

export function sameSet(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function historyAction(payload: Record<string, unknown>): string {
  const changes = asRecord(payload.changes);
  if (changes && Object.keys(changes).length)
    return `history:${Object.keys(changes).sort().join(',')}`;
  if (payload.archived === true) return 'archived';
  if (payload.trashed === true) return 'trashed';
  return 'updated';
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'request failed';
}

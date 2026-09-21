import type { SqlDb, SqlRow } from '../types.ts';
import { numberValue, record, text } from './values.ts';

export type ImportedFile = {
  sourceId: string;
  sourceUrl: string | null;
  issueId: string;
  destinationId: string;
  url: string | null;
  checksum: string | null;
  size: number | null;
  contentType: string | null;
};

export function importedFiles(
  sql: SqlDb,
  workspaceId: string,
  provider: string,
  sourceWorkspaceId: string,
): ImportedFile[] {
  const rows = sql
    .exec<
      {
        source_id: string;
        destination_id: string;
        issue_id: string;
        url: string | null;
        file_json: string | null;
      } & SqlRow
    >(
      "SELECT sr.source_id, sr.destination_id, a.issue_id, a.url, a.file_json FROM source_records sr JOIN issue_attachments a ON a.id = sr.destination_id WHERE sr.workspace_id = ? AND sr.provider = ? AND sr.source_workspace_id = ? AND sr.kind = 'attachment' ORDER BY sr.source_id",
      workspaceId,
      provider,
      sourceWorkspaceId,
    )
    .toArray();
  return rows.map((row) => {
    const file = parseJson(row.file_json);
    return {
      sourceId: row.source_id,
      sourceUrl: row.url ?? text(file, 'sourceUrl'),
      issueId: row.issue_id,
      destinationId: row.destination_id,
      url: text(file, 'destinationUrl'),
      checksum: text(file, 'checksum'),
      size: numberValue(file, 'size'),
      contentType: text(file, 'contentType'),
    };
  });
}

function parseJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return record(JSON.parse(value));
  } catch {
    return null;
  }
}

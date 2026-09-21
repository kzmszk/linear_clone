import { rows } from '../db.ts';
import { getIssue } from './queries.ts';
import type { AuthActor, SqlDb, SqlRow } from '../types.ts';

type AttachmentRow = SqlRow & {
  id: string;
  title: string;
  url: string | null;
  destination_url: string | null;
  content_type: string | null;
};

export function listAttachments(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
  includeArchived = false,
) {
  const issue = getIssue(sql, actor, workspaceId, issueId);
  return rows<AttachmentRow>(
    sql,
    `SELECT id, title, url, json_extract(file_json, '$.destinationUrl') AS destination_url,
      json_extract(file_json, '$.contentType') AS content_type FROM issue_attachments
      WHERE workspace_id = ? AND issue_id = ? AND (? OR archived_at IS NULL) ORDER BY created_at, id`,
    workspaceId,
    issueId,
    includeArchived || issue.archivedAt !== null ? 1 : 0,
  ).flatMap((row) => {
    const url = row.destination_url ?? row.url;
    if (!url || (!url.startsWith('/api/v1/') && !/^https?:\/\//i.test(url)))
      return [];
    return [
      { id: row.id, title: row.title, url, contentType: row.content_type },
    ];
  });
}

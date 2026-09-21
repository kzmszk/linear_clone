import { now } from '../db.ts';
import type { AuthActor, SqlDb } from '../types.ts';
import { normalizeSecondary } from './secondary.ts';
import { normalizeIssueOrComment } from './issues.ts';
import { normalizeOrganization } from './organization.ts';
import { saveIdentity, saveItemIdentity } from './values.ts';
import type { ImportBatch, ImportItem } from './types.ts';

export function normalizeImportedItem(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
  actor: AuthActor,
): string | null {
  const timestamp = now();
  saveItemIdentity(sql, workspaceId, batch, item);
  if (batch.kind === 'member') {
    saveIdentity(sql, workspaceId, batch, item.payload);
    return null;
  }
  if (
    batch.kind === 'team' ||
    batch.kind === 'state' ||
    batch.kind === 'label' ||
    batch.kind === 'project'
  )
    return normalizeOrganization(
      sql,
      workspaceId,
      batch,
      item,
      timestamp,
      actor,
    );
  if (batch.kind === 'issue' || batch.kind === 'comment')
    return normalizeIssueOrComment(sql, workspaceId, batch, item, timestamp);
  return normalizeSecondary(sql, workspaceId, batch, item);
}

export function resolveImportedReferences(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
): void {
  sql.exec(
    "UPDATE issues SET parent_id = (SELECT destination_id FROM source_records WHERE workspace_id = issues.workspace_id AND provider = ? AND source_workspace_id = ? AND kind = 'issue' AND source_id = issues.source_parent_issue_id ORDER BY source_revision DESC LIMIT 1), source_parent_issue_id = NULL WHERE workspace_id = ? AND source_parent_issue_id IS NOT NULL AND EXISTS (SELECT 1 FROM source_records WHERE workspace_id = issues.workspace_id AND provider = ? AND source_workspace_id = ? AND kind = 'issue' AND source_id = issues.source_parent_issue_id AND destination_id IS NOT NULL)",
    batch.provider,
    batch.sourceWorkspaceId,
    workspaceId,
    batch.provider,
    batch.sourceWorkspaceId,
  );
  sql.exec(
    "UPDATE comments SET parent_comment_id = (SELECT destination_id FROM source_records WHERE workspace_id = comments.workspace_id AND provider = ? AND source_workspace_id = ? AND kind = 'comment' AND source_id = comments.source_parent_comment_id ORDER BY source_revision DESC LIMIT 1), source_parent_comment_id = NULL WHERE workspace_id = ? AND source_parent_comment_id IS NOT NULL AND EXISTS (SELECT 1 FROM source_records WHERE workspace_id = comments.workspace_id AND provider = ? AND source_workspace_id = ? AND kind = 'comment' AND source_id = comments.source_parent_comment_id AND destination_id IS NOT NULL)",
    batch.provider,
    batch.sourceWorkspaceId,
    workspaceId,
    batch.provider,
    batch.sourceWorkspaceId,
  );
}

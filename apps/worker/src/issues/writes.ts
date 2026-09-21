import { newId, one } from '../db.ts';
import type { SqlDb } from '../types.ts';

export function updateStateDates(
  sql: SqlDb,
  issueId: string,
  stateId: string,
  timestamp: string,
): void {
  const state = one<{ type: string }>(
    sql,
    'SELECT type FROM workflow_states WHERE id = ?',
    stateId,
  );
  sql.exec(
    'UPDATE issues SET completed_at = ?, canceled_at = ? WHERE id = ?',
    state?.type === 'completed' ? timestamp : null,
    state?.type === 'canceled' ? timestamp : null,
    issueId,
  );
}
export function setLabels(
  sql: SqlDb,
  issueId: string,
  labelIds: string[],
): void {
  sql.exec('DELETE FROM issue_labels WHERE issue_id = ?', issueId);
  for (const labelId of labelIds)
    sql.exec(
      'INSERT INTO issue_labels (issue_id, label_id) VALUES (?, ?)',
      issueId,
      labelId,
    );
}

export function addActivity(
  sql: SqlDb,
  workspaceId: string,
  issueId: string,
  actor: string,
  action: string,
  timestamp: string,
): void {
  sql.exec(
    'INSERT INTO activities (id, workspace_id, issue_id, actor, action, created_at, source) VALUES (?, ?, ?, ?, ?, ?, 0)',
    newId(),
    workspaceId,
    issueId,
    actor,
    action,
    timestamp,
  );
}

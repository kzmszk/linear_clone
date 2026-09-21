import type {
  Comment,
  Issue,
} from '../../../../packages/contracts/src/index.ts';
import type { ActivityRow, CommentRow, IssueRow } from '../types.ts';

export function issueRecord(row: IssueRow, labelIds: string[]): Issue {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id,
    teamId: row.team_id,
    identifier: `${row.team_key}-${row.issue_number}`,
    number: row.issue_number,
    title: row.title,
    description: row.description,
    stateId: row.state_id,
    priority: row.priority,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    projectId: row.project_id,
    parentId: row.parent_id,
    estimate: row.estimate,
    dueDate: row.due_date,
    labelIds,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    completedAt: row.completed_at,
    canceledAt: row.canceled_at,
    sourceId: row.source_id,
  };
}

export function commentRecord(row: CommentRow): Comment {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id,
    issueId: row.issue_id,
    body: row.body,
    authorName: row.author_name,
    parentCommentId: row.parent_comment_id,
    deletedAt: row.deleted_at,
  };
}

export function activityRecord(row: ActivityRow) {
  return {
    id: row.id,
    issueId: row.issue_id,
    actor: row.actor,
    action: row.action,
    createdAt: row.created_at,
    source: row.source === 1,
  };
}

import { addActivity } from './writes.ts';
import type { DurableObjectStorage } from '@cloudflare/workers-types';
import { newId, now, one } from '../db.ts';
import { conflict, notFound } from '../errors.ts';
import { runMutation } from '../mutations.ts';
import {
  requireTeamAccess,
  requireUser,
} from '../organization/authentication.ts';
import { issueRow } from './queries.ts';
import { commentRecord } from './records.ts';
import type {
  AuthActor,
  CommentRow,
  MutationResponse,
  SqlDb,
  SqlRow,
} from '../types.ts';
import type { Comment } from '../../../../packages/contracts/src/index.ts';

export type CommentInput = { body: string; parentCommentId: string | null };
export type CommentPatch = { body?: string; expectedVersion: number };

export function createComment(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
  operationId: string,
  requestHash: string,
  input: CommentInput,
  options: { id?: string } = {},
): MutationResponse<Comment> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => authorizeIssue(sql, actor, workspaceId, issueId),
    apply: () => {
      if (
        options.id !== undefined &&
        one<{ id: string } & SqlRow>(
          sql,
          'SELECT id FROM comments WHERE id = ?',
          options.id,
        ) !== null
      )
        throw conflict('entity_id_taken', 'Comment ID is already in use');
      const user = requireUser(sql, actor);
      const issue = issueRow(sql, issueId);
      if (issue === null) throw notFound();
      if (input.parentCommentId !== null) {
        const parent = one<{ id: string; issue_id: string } & SqlRow>(
          sql,
          'SELECT id, issue_id FROM comments WHERE id = ?',
          input.parentCommentId,
        );
        if (parent === null || parent.issue_id !== issueId)
          throw notFound('Parent comment was not found');
      }
      const timestamp = now();
      const commentId = options.id ?? newId();
      sql.exec(
        'INSERT INTO comments (id, workspace_id, issue_id, body, author_id, author_name, parent_comment_id, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
        commentId,
        workspaceId,
        issueId,
        input.body,
        user.id,
        user.name || actor.email,
        input.parentCommentId,
        timestamp,
        timestamp,
      );
      addActivity(
        sql,
        workspaceId,
        issueId,
        actor.email,
        'commented',
        timestamp,
      );
      const row = commentRow(sql, commentId);
      if (row === null) throw new Error('comment insert failed');
      return {
        entityKind: 'comment.created',
        entityId: commentId,
        version: row.version,
        current: commentRecord(row),
        payload: { issueId, action: 'created' },
      };
    },
    current: (entityId) => commentCurrent(sql, actor, workspaceId, entityId),
  });
}

export function patchComment(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
  commentId: string,
  operationId: string,
  requestHash: string,
  patch: CommentPatch,
): MutationResponse<Comment> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => authorizeIssue(sql, actor, workspaceId, issueId),
    apply: () => {
      const row = commentRow(sql, commentId);
      if (
        row === null ||
        row.issue_id !== issueId ||
        row.workspace_id !== workspaceId
      )
        throw notFound();
      if (row.version !== patch.expectedVersion)
        throw conflict(
          'version_conflict',
          'Comment was changed',
          commentRecord(row),
        );
      const timestamp = now();
      sql.exec(
        'UPDATE comments SET body = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
        patch.body ?? row.body,
        timestamp,
        commentId,
        patch.expectedVersion,
      );
      addActivity(
        sql,
        workspaceId,
        issueId,
        actor.email,
        'comment_updated',
        timestamp,
      );
      const updated = commentRow(sql, commentId);
      if (updated === null) throw new Error('comment update failed');
      return {
        entityKind: 'comment.updated',
        entityId: commentId,
        version: updated.version,
        current: commentRecord(updated),
        payload: { issueId, action: 'updated' },
      };
    },
    current: (entityId) => commentCurrent(sql, actor, workspaceId, entityId),
  });
}

export function deleteComment(
  sql: SqlDb,
  storage: DurableObjectStorage,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
  commentId: string,
  operationId: string,
  requestHash: string,
  expectedVersion: number,
): MutationResponse<Comment> {
  return runMutation({
    sql,
    storage,
    actor,
    operationId,
    requestHash,
    workspaceId,
    authorize: () => authorizeIssue(sql, actor, workspaceId, issueId),
    apply: () => {
      const row = commentRow(sql, commentId);
      if (
        row === null ||
        row.issue_id !== issueId ||
        row.workspace_id !== workspaceId
      )
        throw notFound();
      if (row.version !== expectedVersion)
        throw conflict(
          'version_conflict',
          'Comment was changed',
          commentRecord(row),
        );
      const timestamp = now();
      sql.exec(
        'UPDATE comments SET deleted_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?',
        timestamp,
        timestamp,
        commentId,
        expectedVersion,
      );
      const updated = commentRow(sql, commentId);
      if (updated === null) throw new Error('comment delete failed');
      return {
        entityKind: 'comment.deleted',
        entityId: commentId,
        version: updated.version,
        current: commentRecord(updated),
        payload: { issueId, action: 'deleted' },
      };
    },
    current: (entityId) => commentCurrent(sql, actor, workspaceId, entityId),
  });
}

function authorizeIssue(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  issueId: string,
): void {
  const row = issueRow(sql, issueId);
  if (row === null || row.workspace_id !== workspaceId) throw notFound();
  requireTeamAccess(sql, actor, row.team_id);
}

function commentCurrent(
  sql: SqlDb,
  actor: AuthActor,
  workspaceId: string,
  commentId: string,
): Comment | null {
  const row = commentRow(sql, commentId);
  if (row === null) return null;
  if (row.workspace_id !== workspaceId) throw notFound();
  authorizeIssue(sql, actor, workspaceId, row.issue_id);
  return commentRecord(row);
}

function commentRow(sql: SqlDb, commentId: string): CommentRow | null {
  return one<CommentRow>(sql, 'SELECT * FROM comments WHERE id = ?', commentId);
}

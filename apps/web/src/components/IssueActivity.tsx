import { useRef, useState } from 'react';
import { Send } from 'lucide-react';
import type { Activity, Comment } from '../api.ts';
import { Avatar, Button } from './ui.tsx';
import { MarkdownBody } from './MarkdownBody.tsx';

function relativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function activityText(item: Activity): string {
  const labels: Record<string, string> = {
    created: 'created this issue',
    updated: 'updated this issue',
    commented: 'added a comment',
    deleted: 'deleted this issue',
    restored: 'restored this issue',
  };
  return labels[item.action] ?? item.action.replace(/_/g, ' ');
}

type FailedSubmission = { body: string; operationId: string };
type TimelineEntry =
  | { kind: 'activity'; item: Activity }
  | { kind: 'comment'; item: Comment };

function resolveSubmission(
  comment: string,
  retry: FailedSubmission | undefined,
  failed: FailedSubmission | undefined,
): FailedSubmission | undefined {
  const body = retry?.body ?? comment.trim();
  if (!body) return undefined;
  return {
    body,
    operationId:
      retry?.operationId ??
      (failed?.body === body ? failed.operationId : undefined) ??
      crypto.randomUUID(),
  };
}

function commentError(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Could not add comment';
}

function timelineEntries(
  comments: Comment[],
  activity: Activity[],
): TimelineEntry[] {
  const visibleActivity =
    comments.length > 0
      ? activity.filter((item) => item.action !== 'commented')
      : activity;
  return [
    ...visibleActivity.map((item) => ({ kind: 'activity' as const, item })),
    ...comments.map((item) => ({ kind: 'comment' as const, item })),
  ].sort(
    (left, right) =>
      timelineTime(left.item.createdAt) - timelineTime(right.item.createdAt),
  );
}

function timelineTime(value: string): number {
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

export function IssueActivity({
  comments,
  activity,
  loading,
  onAddComment,
}: {
  comments: Comment[];
  activity: Activity[];
  loading: boolean;
  onAddComment: (body: string, operationId: string) => Promise<void>;
}) {
  const entries = timelineEntries(comments, activity);
  return (
    <>
      <section className="activity-section">
        <div className="section-heading">
          <h3>Activity</h3>
          <span>{loading ? 'Loading…' : `${entries.length} events`}</span>
        </div>
        {entries.map((entry) => (
          <TimelineEntryView key={entry.item.id} entry={entry} />
        ))}
        {entries.length === 0 && !loading ? (
          <p className="muted-copy">No activity yet.</p>
        ) : null}
      </section>
      <CommentComposer onAddComment={onAddComment} />
    </>
  );
}

function TimelineEntryView({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === 'activity') return <ActivityEntry item={entry.item} />;
  return <CommentEntry item={entry.item} />;
}

function ActivityEntry({ item }: { item: Activity }) {
  return (
    <div className="activity-item">
      <Avatar name={item.actor} size="sm" />
      <div>
        <p>
          <strong>{item.actor}</strong> {activityText(item)}
        </p>
        <time>{relativeDate(item.createdAt)}</time>
      </div>
    </div>
  );
}

function CommentEntry({ item }: { item: Comment }) {
  return (
    <div className="comment-item">
      <Avatar name={item.authorName} size="sm" />
      <div className="comment-body">
        <p className="comment-meta">
          <strong>{item.authorName}</strong>
          <time>{relativeDate(item.createdAt)}</time>
        </p>
        <MarkdownBody body={item.body} />
      </div>
    </div>
  );
}

function CommentComposer({
  onAddComment,
}: {
  onAddComment: (body: string, operationId: string) => Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const commentRef = useRef('');
  const [failed, setFailed] = useState<FailedSubmission>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  function updateComment(value: string) {
    commentRef.current = value;
    setComment(value);
  }
  async function submit(retry?: FailedSubmission) {
    if (saving) return;
    const submission = resolveSubmission(comment, retry, failed);
    if (!submission) return;
    if (commentRef.current.trim() === submission.body) updateComment('');
    setSaving(true);
    setError('');
    try {
      await onAddComment(submission.body, submission.operationId);
      setFailed((current) =>
        current?.operationId === submission.operationId ? undefined : current,
      );
    } catch (reason) {
      setFailed(submission);
      if (!commentRef.current) updateComment(submission.body);
      setError(commentError(reason));
    } finally {
      setSaving(false);
    }
  }
  const visibleError = error || (failed ? 'A comment still needs retry.' : '');
  return (
    <>
      <section className="comment-composer">
        <Avatar name="You" />
        <textarea
          aria-label="Add a comment"
          placeholder="Leave a comment…"
          value={comment}
          onChange={(event) => updateComment(event.target.value)}
          onKeyDown={(event) => {
            if (
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229 &&
              (event.metaKey || event.ctrlKey) &&
              event.key === 'Enter'
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <Button
          tone="primary"
          disabled={!comment.trim() || saving}
          onClick={() => void submit()}
        >
          <Send size={14} /> Comment
        </Button>
      </section>
      {visibleError ? (
        <CommentError
          message={visibleError}
          failed={failed}
          saving={saving}
          onRetry={(item) => void submit(item)}
        />
      ) : null}
    </>
  );
}

function CommentError({
  message,
  failed,
  saving,
  onRetry,
}: {
  message: string;
  failed: FailedSubmission | undefined;
  saving: boolean;
  onRetry: (submission: FailedSubmission) => void;
}) {
  return (
    <div className="inline-error" role="alert">
      <span>{message}</span>
      {failed ? <span>Failed comment: {failed.body}</span> : null}
      {failed ? (
        <Button disabled={saving} onClick={() => onRetry(failed)}>
          Retry comment
        </Button>
      ) : null}
    </div>
  );
}

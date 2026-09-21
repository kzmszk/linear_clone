import { useState } from 'react';
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

export function IssueActivity({
  comments,
  activity,
  loading,
  onAddComment,
}: {
  comments: Comment[];
  activity: Activity[];
  loading: boolean;
  onAddComment: (body: string) => Promise<void>;
}) {
  return (
    <>
      <section className="activity-section">
        <div className="section-heading">
          <h3>Activity</h3>
          <span>
            {loading
              ? 'Loading…'
              : `${activity.length + comments.length} events`}
          </span>
        </div>
        {activity.map((item) => (
          <div className="activity-item" key={item.id}>
            <Avatar name={item.actor} size="sm" />
            <div>
              <p>
                <strong>{item.actor}</strong> {activityText(item)}
              </p>
              <time>{relativeDate(item.createdAt)}</time>
            </div>
          </div>
        ))}
        {comments.map((item) => (
          <div className="comment-item" key={item.id}>
            <Avatar name={item.authorName} size="sm" />
            <div className="comment-body">
              <p className="comment-meta">
                <strong>{item.authorName}</strong>
                <time>{relativeDate(item.createdAt)}</time>
              </p>
              <MarkdownBody body={item.body} />
            </div>
          </div>
        ))}
        {activity.length === 0 && comments.length === 0 && !loading ? (
          <p className="muted-copy">No activity yet.</p>
        ) : null}
      </section>
      <CommentComposer onAddComment={onAddComment} />
    </>
  );
}

function CommentComposer({
  onAddComment,
}: {
  onAddComment: (body: string) => Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    if (!comment.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onAddComment(comment.trim());
      setComment('');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not add comment',
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <section className="comment-composer">
        <Avatar name="You" />
        <textarea
          aria-label="Add a comment"
          placeholder="Leave a comment…"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter')
              void submit();
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
      {error ? (
        <div className="inline-error" role="alert">
          {error}
        </div>
      ) : null}
    </>
  );
}

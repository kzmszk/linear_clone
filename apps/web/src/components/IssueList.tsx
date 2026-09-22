import { useEffect, useRef } from 'react';
import { Inbox } from 'lucide-react';
import type { Issue, Metadata } from '../api.ts';
import {
  Avatar,
  EmptyState,
  Loading,
  PriorityIcon,
  StatusIcon,
} from './ui.tsx';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return date.getFullYear() === new Date().getFullYear()
    ? day
    : date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
}

function stateFor(issue: Issue, metadata: Metadata) {
  return metadata.states.find((state) => state.id === issue.stateId);
}

function assigneeFor(issue: Issue, metadata: Metadata) {
  return metadata.members.find((member) => member.userId === issue.assigneeId);
}

function projectFor(issue: Issue, metadata: Metadata) {
  return metadata.projects.find((project) => project.id === issue.projectId);
}

export function IssueList({
  title,
  issues,
  metadata,
  selectedIssueId,
  loading,
  error,
  hasMore,
  onLoadMore,
  onSelect,
  onCreate,
}: {
  title: string;
  issues: Issue[];
  metadata: Metadata;
  selectedIssueId?: string;
  loading: boolean;
  error?: string;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelect: (issue: Issue) => void;
  onCreate: () => void;
}) {
  useReturnFocus(selectedIssueId);
  if (loading && issues.length === 0) return <IssueListState loading />;
  if (error) return <IssueListState error={error} />;
  return (
    <main className="issue-list-pane">
      <div className="list-toolbar">
        <div>
          <h1>{title}</h1>
        </div>
      </div>
      <div className="list-meta">
        <span>
          {issues.length} {issues.length === 1 ? 'issue' : 'issues'}
        </span>
        {loading ? <span className="inline-loading">Updating…</span> : null}
      </div>
      {issues.length === 0 ? (
        <EmptyState
          icon={<Inbox size={23} />}
          title="All clear"
          description="There are no issues matching this view."
          action={
            <button className="button button-primary" onClick={onCreate}>
              Create an issue <span className="shortcut">C</span>
            </button>
          }
        />
      ) : (
        <IssueRows
          issues={issues}
          metadata={metadata}
          selectedIssueId={selectedIssueId}
          onSelect={onSelect}
        />
      )}
      {hasMore ? (
        <div className="load-more">
          <button
            className="button button-quiet"
            disabled={loading}
            onClick={onLoadMore}
          >
            {loading ? 'Loading…' : 'Load more issues'}
          </button>
        </div>
      ) : null}
    </main>
  );
}

function IssueListState({
  loading,
  error,
}: {
  loading?: boolean;
  error?: string;
}) {
  return (
    <main className="issue-list-pane">
      {loading ? (
        <Loading label="Loading issues" />
      ) : (
        <EmptyState
          icon={<Inbox size={24} />}
          title="Couldn’t load issues"
          description={error ?? 'Could not load issues'}
        />
      )}
    </main>
  );
}

function IssueRows({
  issues,
  metadata,
  selectedIssueId,
  onSelect,
}: {
  issues: Issue[];
  metadata: Metadata;
  selectedIssueId?: string;
  onSelect: (issue: Issue) => void;
}) {
  return (
    <div className="issue-table" role="list" aria-label="Issues">
      {issues.map((issue) => (
        <IssueRow
          key={issue.id}
          issue={issue}
          metadata={metadata}
          selected={selectedIssueId === issue.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function IssueRow({
  issue,
  metadata,
  selected,
  onSelect,
}: {
  issue: Issue;
  metadata: Metadata;
  selected: boolean;
  onSelect: (issue: Issue) => void;
}) {
  const state = stateFor(issue, metadata);
  const assignee = assigneeFor(issue, metadata);
  const project = projectFor(issue, metadata);
  return (
    <button
      className={`issue-row ${selected ? 'selected' : ''}`}
      role="listitem"
      data-issue-id={issue.id}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const sibling =
          event.key === 'ArrowDown'
            ? event.currentTarget.nextElementSibling
            : event.currentTarget.previousElementSibling;
        if (sibling instanceof HTMLElement) sibling.focus();
      }}
      onClick={() => onSelect(issue)}
    >
      <PriorityIcon priority={issue.priority} />
      <span className="issue-identifier">{issue.identifier}</span>
      <span className="issue-status" title={state?.name ?? 'Unknown status'}>
        <StatusIcon type={state?.type ?? 'unstarted'} color={state?.color} />
      </span>
      <span className="issue-title">{issue.title}</span>
      <span className="issue-row-project">{project?.name ?? ''}</span>
      <Avatar
        name={assignee?.name ?? issue.assigneeName}
        email={assignee?.email}
      />
      <span className="issue-row-date">{formatDate(issue.updatedAt)}</span>
    </button>
  );
}

function useReturnFocus(selectedIssueId: string | undefined) {
  const lastSelection = useRef(selectedIssueId);
  useEffect(() => {
    if (!selectedIssueId && lastSelection.current) {
      document
        .querySelector<HTMLElement>(
          `[data-issue-id="${lastSelection.current}"]`,
        )
        ?.focus();
    }
    lastSelection.current = selectedIssueId;
  }, [selectedIssueId]);
}

import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api, type Issue } from '../api.ts';
import { Button, Dialog, ErrorNotice } from './ui.tsx';

export function IssuePicker({
  title,
  workspaceId,
  excludeIds,
  onChoose,
  onClose,
}: {
  title: string;
  workspaceId: string;
  excludeIds: string[];
  onChoose: (issue: Issue) => Promise<void>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 150);
    return () => window.clearTimeout(timer);
  }, [search]);
  const results = useInfiniteQuery({
    queryKey: ['issue-picker', workspaceId, query],
    queryFn: ({ pageParam }) =>
      api.listIssues(workspaceId, { q: query, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.cursor ?? undefined,
  });
  async function choose(issue: Issue) {
    setSaving(true);
    setError('');
    try {
      await onChoose(issue);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not update issue',
      );
    } finally {
      setSaving(false);
    }
  }
  const matches = results.data?.pages
    .flatMap((page) => page.items)
    .filter((issue) => !excludeIds.includes(issue.id));
  return (
    <Dialog title={title} onClose={onClose} dismissible={!saving}>
      <div className="issue-picker">
        <input
          data-dialog-autofocus
          aria-label="Search issues"
          placeholder="Search by title or identifier"
          value={search}
          disabled={saving}
          onChange={(event) => setSearch(event.target.value)}
        />
        {error ? <ErrorNotice message={error} /> : null}
        {results.isError ? (
          <ErrorNotice message="Could not search issues" />
        ) : null}
        <IssuePickerResults
          matches={matches}
          loading={results.isLoading}
          hasMore={results.hasNextPage}
          loadingMore={results.isFetchingNextPage}
          saving={saving}
          onChoose={(issue) => void choose(issue)}
          onMore={() => void results.fetchNextPage()}
        />
      </div>
    </Dialog>
  );
}

function IssuePickerResults({
  matches,
  loading,
  hasMore,
  loadingMore,
  saving,
  onChoose,
  onMore,
}: {
  matches?: Issue[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  saving: boolean;
  onChoose: (issue: Issue) => void;
  onMore: () => void;
}) {
  return (
    <div className="issue-picker-results" aria-label="Matching issues">
      {matches?.map((issue) => (
        <button
          key={issue.id}
          type="button"
          disabled={saving}
          onClick={() => onChoose(issue)}
        >
          <strong>{issue.identifier}</strong>
          <span>{issue.title}</span>
        </button>
      ))}
      {loading ? <span>Searching…</span> : null}
      {matches?.length === 0 && !hasMore ? (
        <span>No matching issues</span>
      ) : null}
      {hasMore ? (
        <Button onClick={onMore} disabled={loadingMore || saving}>
          {loadingMore ? 'Loading…' : 'Load more issues'}
        </Button>
      ) : null}
    </div>
  );
}

import { ApiError } from '../api.ts';
import { IssueList } from '../components/IssueList.tsx';
import type { useWorkspaceController } from './useWorkspaceController.ts';

type Controller = ReturnType<typeof useWorkspaceController>;

export function IssuesRoute({ controller }: { controller: Controller }) {
  const { metadata, issues, selectedIssueId, selectIssue, setShowCreate } =
    controller;
  if (!metadata.data) return null;
  const items = issues.data?.pages.flatMap((page) => page.items) ?? [];
  const error =
    issues.error instanceof ApiError
      ? issues.error.message
      : issues.error
        ? 'Could not load issues'
        : undefined;
  return (
    <IssueList
      issues={items}
      metadata={metadata.data}
      selectedIssueId={selectedIssueId}
      loading={issues.isFetching}
      error={error}
      hasMore={Boolean(issues.hasNextPage)}
      onLoadMore={() => void issues.fetchNextPage()}
      onSelect={selectIssue}
      onCreate={() => setShowCreate(true)}
    />
  );
}

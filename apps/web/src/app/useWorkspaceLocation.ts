import { useCallback, useEffect, useState } from 'react';

function readLocation() {
  const params = new URLSearchParams(window.location.search);
  return {
    workspaceId: params.get('workspace') ?? '',
    selectedIssueId: params.get('issue') ?? undefined,
  };
}

export function useWorkspaceLocation() {
  const [location, setLocation] = useState(readLocation);
  useEffect(() => {
    const onPopState = () => setLocation(readLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const navigate = useCallback(
    (next: ReturnType<typeof readLocation>, replace = false) => {
      const current = readLocation();
      if (
        current.workspaceId === next.workspaceId &&
        current.selectedIssueId === next.selectedIssueId
      )
        return;
      const url = new URL(window.location.href);
      url.searchParams.set('workspace', next.workspaceId);
      if (next.selectedIssueId)
        url.searchParams.set('issue', next.selectedIssueId);
      else url.searchParams.delete('issue');
      if (current.workspaceId && !replace)
        window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
      setLocation(next);
    },
    [],
  );
  const setWorkspaceId = useCallback(
    (workspaceId: string, replace = false) => {
      navigate({ workspaceId, selectedIssueId: undefined }, replace);
    },
    [navigate],
  );
  const setSelectedIssueId = useCallback(
    (selectedIssueId: string | undefined) => {
      navigate({ ...readLocation(), selectedIssueId });
    },
    [navigate],
  );
  return { ...location, setWorkspaceId, setSelectedIssueId };
}

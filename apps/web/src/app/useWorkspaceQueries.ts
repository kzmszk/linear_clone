import { useMemo } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useAccountQuery, useWorkspaceMetadata } from './useAccountQueries.ts';
import { useIssueQueries } from './useIssueQueries.ts';
import { useWorkspaceEvents } from './useWorkspaceEvents.ts';
import type { useWorkspaceState } from './useWorkspaceState.ts';

type WorkspaceSelection = Pick<
  ReturnType<typeof useWorkspaceState>,
  'workspaceId' | 'teamId' | 'projectId' | 'search' | 'view' | 'selectedIssueId'
>;

export function useWorkspaceQueries(
  state: WorkspaceSelection,
  queryClient: QueryClient,
) {
  const me = useAccountQuery();
  const workspace =
    me.data?.workspaces.find((item) => item.id === state.workspaceId) ??
    me.data?.workspaces[0];
  const connected = useWorkspaceEvents(workspace?.id, queryClient);
  const fallbackInterval = connected ? false : 60_000;
  const metadata = useWorkspaceMetadata(workspace?.id, fallbackInterval);
  const filters = useMemo(
    () => ({
      teamId: state.teamId,
      projectId: state.projectId,
      q: state.search.trim() || undefined,
    }),
    [state.projectId, state.search, state.teamId],
  );
  const issueQueries = useIssueQueries(
    workspace?.id,
    state.view,
    filters,
    state.selectedIssueId,
    fallbackInterval,
  );
  return { me, workspace, metadata, filters, ...issueQueries };
}

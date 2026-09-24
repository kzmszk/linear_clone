import { useMemo } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useAccountQuery, useWorkspaceMetadata } from './useAccountQueries.ts';
import { useIssueQueries } from './useIssueQueries.ts';
import { useWorkspaceEvents } from './useWorkspaceEvents.ts';
import type { useWorkspaceState } from './useWorkspaceState.ts';

type WorkspaceSelection = Pick<
  ReturnType<typeof useWorkspaceState>,
  | 'workspaceId'
  | 'teamId'
  | 'projectId'
  | 'search'
  | 'view'
  | 'issueScope'
  | 'selectedIssueId'
>;

export function useWorkspaceQueries(
  state: WorkspaceSelection,
  queryClient: QueryClient,
) {
  const me = useAccountQuery();
  const activeWorkspaces = me.data?.workspaces.filter(
    (item) => !item.archivedAt,
  );
  const workspace =
    activeWorkspaces?.find((item) => item.id === state.workspaceId) ??
    activeWorkspaces?.[0];
  const connected = useWorkspaceEvents(workspace?.id, queryClient);
  const fallbackInterval = connected ? false : 60_000;
  const metadataQuery = useWorkspaceMetadata(workspace?.id, fallbackInterval);
  const metadata = useMemo(
    () => ({
      ...metadataQuery,
      data: metadataQuery.data
        ? {
            ...metadataQuery.data,
            teams: metadataQuery.data.teams.filter((item) => !item.archivedAt),
            projects: metadataQuery.data.projects.filter(
              (item) => !item.archivedAt,
            ),
            states: metadataQuery.data.states.filter(
              (item) => !item.archivedAt,
            ),
            labels: metadataQuery.data.labels.filter(
              (item) => !item.archivedAt,
            ),
          }
        : undefined,
    }),
    [metadataQuery],
  );
  const filters = useMemo(() => {
    const active = state.issueScope === 'active';
    return {
      deleted: state.issueScope === 'trash',
      archived: state.issueScope === 'archived',
      teamId: active ? state.teamId : undefined,
      projectId: active ? state.projectId : undefined,
      q: active ? state.search.trim() || undefined : undefined,
    };
  }, [state.issueScope, state.projectId, state.search, state.teamId]);
  const issueQueries = useIssueQueries(
    workspace?.id,
    state.view === 'issues',
    filters,
    state.selectedIssueId,
    fallbackInterval,
  );
  return {
    me,
    workspace,
    activeWorkspaces,
    metadata,
    filters,
    ...issueQueries,
  };
}

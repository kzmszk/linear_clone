import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, type IssueFilters } from '../api.ts';

const firstIssueCursor: string | null = null;

export function useIssueQueries(
  workspaceId: string | undefined,
  view: 'issues' | 'settings',
  filters: IssueFilters,
  selectedIssueId: string | undefined,
  fallbackInterval: number | false,
) {
  const issues = useInfiniteQuery({
    queryKey: ['issues', workspaceId, filters],
    queryFn: ({ pageParam }) =>
      api.listIssues(workspaceId ?? '', { ...filters, cursor: pageParam }),
    initialPageParam: firstIssueCursor,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    refetchInterval: fallbackInterval,
    enabled: Boolean(workspaceId) && view === 'issues',
  });
  const selectedIssue = useQuery({
    queryKey: ['issue', workspaceId, selectedIssueId],
    queryFn: () => api.getIssue(workspaceId ?? '', selectedIssueId ?? ''),
    refetchInterval: fallbackInterval,
    enabled: Boolean(workspaceId && selectedIssueId),
  });
  const comments = useQuery({
    queryKey: ['comments', workspaceId, selectedIssueId],
    queryFn: () => api.getComments(workspaceId ?? '', selectedIssueId ?? ''),
    refetchInterval: fallbackInterval,
    enabled: Boolean(workspaceId && selectedIssueId),
  });
  const activity = useQuery({
    queryKey: ['activity', workspaceId, selectedIssueId],
    queryFn: () => api.getActivity(workspaceId ?? '', selectedIssueId ?? ''),
    refetchInterval: fallbackInterval,
    enabled: Boolean(workspaceId && selectedIssueId),
  });
  const attachments = useQuery({
    queryKey: ['attachments', workspaceId, selectedIssueId],
    queryFn: () => api.getAttachments(workspaceId ?? '', selectedIssueId ?? ''),
    refetchInterval: fallbackInterval,
    enabled: Boolean(workspaceId && selectedIssueId),
  });
  const relations = useQuery({
    queryKey: ['relations', workspaceId, selectedIssueId],
    queryFn: () => api.getRelations(workspaceId ?? '', selectedIssueId ?? ''),
    refetchInterval: fallbackInterval,
    enabled: Boolean(workspaceId && selectedIssueId),
  });
  return { issues, selectedIssue, comments, activity, attachments, relations };
}

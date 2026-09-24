import { useQuery } from '@tanstack/react-query';
import { archiveApi } from '../archiveApi.ts';
import type { ArchiveSection } from './useWorkspaceState.ts';

export function useArchivedResourceQueries(
  workspaceId: string | undefined,
  section: ArchiveSection | undefined,
) {
  const enabled = Boolean(workspaceId);
  const projects = useQuery({
    queryKey: ['archived', workspaceId, 'projects'],
    queryFn: async () =>
      (await archiveApi.listProjects(workspaceId ?? '')).filter(
        (item) => item.archivedAt,
      ),
    enabled: enabled && section === 'projects',
  });
  const teams = useQuery({
    queryKey: ['archived', workspaceId, 'teams'],
    queryFn: async () =>
      (await archiveApi.listTeams(workspaceId ?? '')).filter(
        (item) => item.archivedAt,
      ),
    enabled: enabled && section === 'teams',
  });
  const labels = useQuery({
    queryKey: ['archived', workspaceId, 'labels'],
    queryFn: async () =>
      (await archiveApi.listLabels(workspaceId ?? '')).filter(
        (item) => item.archivedAt,
      ),
    enabled: enabled && section === 'labels',
  });
  const statuses = useQuery({
    queryKey: ['archived', workspaceId, 'statuses'],
    queryFn: async () =>
      (await archiveApi.listStatuses(workspaceId ?? '')).filter(
        (item) => item.archivedAt,
      ),
    enabled: enabled && section === 'statuses',
  });
  return { projects, teams, labels, statuses };
}

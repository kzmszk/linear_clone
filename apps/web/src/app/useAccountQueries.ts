import { useQuery } from '@tanstack/react-query';
import { api } from '../api.ts';

export function useAccountQuery() {
  return useQuery({ queryKey: ['me'], queryFn: api.getMe, retry: false });
}

export function useWorkspaceMetadata(
  workspaceId: string | undefined,
  fallbackInterval: number | false,
) {
  return useQuery({
    queryKey: ['metadata', workspaceId],
    queryFn: () => api.getMetadata(workspaceId ?? ''),
    enabled: Boolean(workspaceId),
    refetchInterval: fallbackInterval,
  });
}

import type { QueryClient } from '@tanstack/react-query';

function generationKey(workspaceId: string | undefined) {
  return ['access-generation', workspaceId] as const;
}

export function accessGeneration(
  queryClient: QueryClient,
  workspaceId: string | undefined,
): number {
  return queryClient.getQueryData<number>(generationKey(workspaceId)) ?? 0;
}

export function resetWorkspaceAccess(
  queryClient: QueryClient,
  workspaceId: string | undefined,
): void {
  if (!workspaceId) return;
  queryClient.setQueryData<number>(generationKey(workspaceId), (current) =>
    current === undefined ? 1 : current + 1,
  );
  void queryClient.resetQueries({
    predicate: (query) =>
      query.queryKey[1] === workspaceId &&
      query.queryKey[0] !== 'access-generation',
  });
}

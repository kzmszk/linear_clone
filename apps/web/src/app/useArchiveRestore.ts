import type { QueryClient } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { archiveApi } from '../archiveApi.ts';

export type ArchiveRestoreTarget = {
  [Kind in 'workspace' | 'team' | 'project' | 'label' | 'status' | 'issue']: {
    kind: Kind;
    id: string;
    version: number;
  };
}['workspace' | 'team' | 'project' | 'label' | 'status' | 'issue'];

export function useArchiveRestore(
  queryClient: QueryClient,
  workspaceId: string | undefined,
) {
  return useMutation({
    mutationFn: (target: ArchiveRestoreTarget) =>
      restoreResource(workspaceId, target),
    onSuccess: (_result, target) => {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      if (workspaceId) {
        void queryClient.invalidateQueries({
          queryKey: ['metadata', workspaceId],
        });
        void queryClient.invalidateQueries({
          queryKey: ['archived', workspaceId],
        });
        if (target.kind === 'issue') {
          void queryClient.invalidateQueries({
            queryKey: ['issues', workspaceId],
          });
          void queryClient.invalidateQueries({
            queryKey: ['issue', workspaceId, target.id],
          });
        }
      }
    },
  });
}

async function restoreResource(
  workspaceId: string | undefined,
  target: ArchiveRestoreTarget,
): Promise<void> {
  if (target.kind === 'workspace') {
    await archiveApi.restoreWorkspace(target.id, target.version);
    return;
  }
  if (!workspaceId) throw new Error('Choose an active workspace first');
  switch (target.kind) {
    case 'team':
      await archiveApi.restoreTeam(workspaceId, target.id, target.version);
      return;
    case 'project':
      await archiveApi.restoreProject(workspaceId, target.id, target.version);
      return;
    case 'label':
      await archiveApi.restoreLabel(workspaceId, target.id, target.version);
      return;
    case 'status':
      await archiveApi.restoreStatus(workspaceId, target.id, target.version);
      return;
    case 'issue':
      await archiveApi.restoreIssue(workspaceId, target.id, target.version);
      return;
    default: {
      const exhaustive: never = target;
      throw new Error(`Unsupported restore target: ${exhaustive}`);
    }
  }
}

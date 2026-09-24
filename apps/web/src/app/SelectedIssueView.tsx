import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../api.ts';
import type { Issue } from '../api.ts';
import { archiveApi } from '../archiveApi.ts';
import type { QueryClient } from '@tanstack/react-query';
import { IssueDetail } from '../components/IssueDetail.tsx';
import { ErrorNotice, Loading } from '../components/ui.tsx';
import type { useWorkspaceController } from './useWorkspaceController.ts';

type Controller = ReturnType<typeof useWorkspaceController>;

export function SelectedIssueView({ controller }: { controller: Controller }) {
  const { workspace, metadata, selectedIssue, setSelectedIssueId } = controller;
  const issue = selectedIssue.data;
  if (!workspace || !metadata.data) return null;
  if (!issue || isUnavailableIssueError(selectedIssue.error))
    return (
      <SelectedIssueState
        query={selectedIssue}
        onClose={() => setSelectedIssueId(undefined)}
      />
    );
  return (
    <LoadedIssueView
      controller={controller}
      workspaceId={workspace.id}
      metadata={metadata.data}
      issue={issue}
    />
  );
}

function LoadedIssueView({
  controller,
  workspaceId,
  metadata,
  issue,
}: {
  controller: Controller;
  workspaceId: string;
  metadata: NonNullable<Controller['metadata']['data']>;
  issue: Issue;
}) {
  const {
    comments,
    activity,
    attachments,
    relations,
    hierarchy,
    queryClient,
    deleteIssue,
    restoreIssue,
    setIssueScope,
  } = controller;
  const archiveAction = useIssueArchiveAction(
    queryClient,
    workspaceId,
    issue,
    setIssueScope,
  );
  const fullActionError = issueActionError(
    deleteIssue.error,
    restoreIssue.error,
    archiveAction.error,
  );
  const lifecycleAction = pendingLifecycleAction(
    deleteIssue.isPending,
    restoreIssue.isPending,
  );
  return (
    <IssueDetail
      key={issue.id}
      issue={issue}
      metadata={metadata}
      comments={comments.data ?? []}
      activity={activity.data ?? []}
      attachments={attachments.data ?? []}
      relations={relations.data ?? []}
      hierarchy={hierarchy.data}
      hierarchyLoading={hierarchy.isLoading}
      hierarchyError={
        hierarchy.isError ? 'Could not load issue hierarchy' : undefined
      }
      workspaceId={workspaceId}
      loading={comments.isLoading || activity.isLoading}
      actionError={fullActionError}
      lifecycleAction={lifecycleAction}
      archivePending={archiveAction.isPending}
      {...issueDetailActions(controller, workspaceId, issue, archiveAction)}
    />
  );
}

function issueDetailActions(
  controller: Controller,
  workspaceId: string,
  issue: Issue,
  archiveAction: ReturnType<typeof useIssueArchiveAction>,
) {
  const {
    queryClient,
    setSelectedIssueId,
    updateIssue,
    deleteIssue,
    restoreIssue,
    addComment,
  } = controller;
  return {
    onSelectIssue: setSelectedIssueId,
    onClose: () => setSelectedIssueId(undefined),
    onSavePatch: (
      patch: Parameters<typeof updateIssue.mutateAsync>[0]['patch'],
      expectedVersion?: number,
    ) =>
      updateIssue
        .mutateAsync({
          issueId: issue.id,
          patch,
          expectedVersion: expectedVersion ?? issue.version,
        })
        .then(() => undefined),
    onSetChildParent: (
      child: { id: string; version: number },
      parentId: string | null,
    ) => updateChildParent(queryClient, workspaceId, child, parentId),
    onDelete: () => deleteIssue.mutate(),
    onRestore: () => restoreIssue.mutate(),
    onArchive: () => archiveAction.mutate({ restore: false }),
    onRestoreArchived: () => archiveAction.mutate({ restore: true }),
    onAddComment: (body: string, operationId: string) =>
      addComment.mutateAsync({ body, operationId }).then(() => undefined),
    onUploadFile: (file: Blob) => api.uploadFile(workspaceId, issue.id, file),
    onCopyIdentifier: () =>
      void navigator.clipboard?.writeText(issue.identifier),
  };
}

function useIssueArchiveAction(
  queryClient: QueryClient,
  workspaceId: string,
  issue: Issue,
  setIssueScope: Controller['setIssueScope'],
) {
  return useMutation({
    mutationFn: ({ restore }: { restore: boolean }) =>
      restore
        ? archiveApi.restoreIssue(workspaceId, issue.id, issue.version)
        : archiveApi.archiveIssue(workspaceId, issue.id, issue.version),
    onSuccess: (result, variables) => {
      queryClient.setQueryData(
        ['issue', workspaceId, result.current.id],
        result.current,
      );
      void queryClient.invalidateQueries({ queryKey: ['issues', workspaceId] });
      void queryClient.invalidateQueries({
        queryKey: ['issue', workspaceId, result.current.id],
      });
      setIssueScope(variables.restore ? 'active' : 'archived');
    },
  });
}

function pendingLifecycleAction(
  deleting: boolean,
  restoring: boolean,
): 'delete' | 'restore' | undefined {
  if (deleting) return 'delete';
  if (restoring) return 'restore';
  return undefined;
}

async function updateChildParent(
  queryClient: QueryClient,
  workspaceId: string,
  child: { id: string; version: number },
  parentId: string | null,
): Promise<void> {
  await api.updateIssue(workspaceId, child.id, {
    parentId,
    expectedVersion: child.version,
  });
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['hierarchy', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['issues', workspaceId] }),
    queryClient.invalidateQueries({ queryKey: ['issue-picker', workspaceId] }),
    queryClient.invalidateQueries({
      queryKey: ['issue', workspaceId, child.id],
    }),
  ]);
}

function isUnavailableIssueError(error: unknown): boolean {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

function SelectedIssueState({
  query,
  onClose,
}: {
  query: Controller['selectedIssue'];
  onClose: () => void;
}) {
  if (query.isLoading)
    return (
      <main className="detail-pane detail-state">
        <Loading label="Loading issue" />
      </main>
    );
  return (
    <main className="detail-pane detail-state">
      <ErrorNotice
        message={
          query.error instanceof ApiError
            ? query.error.message
            : 'Could not load the issue'
        }
        onRetry={() => void query.refetch()}
      />
      <button className="button button-quiet" onClick={onClose}>
        Back to issues
      </button>
    </main>
  );
}

function issueActionError(
  deleteError: unknown,
  restoreError: unknown,
  archiveError?: unknown,
): string | undefined {
  if (deleteError instanceof ApiError) return deleteError.message;
  if (restoreError instanceof ApiError) return restoreError.message;
  if (archiveError instanceof ApiError) return archiveError.message;
  return deleteError || restoreError || archiveError
    ? 'Could not update the issue'
    : undefined;
}

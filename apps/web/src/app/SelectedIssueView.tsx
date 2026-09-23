import { api, ApiError } from '../api.ts';
import { IssueDetail } from '../components/IssueDetail.tsx';
import { ErrorNotice, Loading } from '../components/ui.tsx';
import type { useWorkspaceController } from './useWorkspaceController.ts';

type Controller = ReturnType<typeof useWorkspaceController>;

export function SelectedIssueView({ controller }: { controller: Controller }) {
  const {
    workspace,
    metadata,
    selectedIssue,
    comments,
    activity,
    attachments,
    relations,
    setSelectedIssueId,
    updateIssue,
    deleteIssue,
    restoreIssue,
    addComment,
  } = controller;
  const issue = selectedIssue.data;
  if (!workspace || !metadata.data) return null;
  if (!issue || isUnavailableIssueError(selectedIssue.error))
    return (
      <SelectedIssueState
        query={selectedIssue}
        onClose={() => setSelectedIssueId(undefined)}
      />
    );
  const actionError = issueActionError(deleteIssue.error, restoreIssue.error);
  const lifecycleAction = deleteIssue.isPending
    ? 'delete'
    : restoreIssue.isPending
      ? 'restore'
      : undefined;
  return (
    <IssueDetail
      key={issue.id}
      issue={issue}
      metadata={metadata.data}
      comments={comments.data ?? []}
      activity={activity.data ?? []}
      attachments={attachments.data ?? []}
      relations={relations.data ?? []}
      onSelectIssue={setSelectedIssueId}
      loading={comments.isLoading || activity.isLoading}
      actionError={actionError}
      lifecycleAction={lifecycleAction}
      onClose={() => setSelectedIssueId(undefined)}
      onSavePatch={(patch, expectedVersion) =>
        updateIssue
          .mutateAsync({
            issueId: issue.id,
            patch,
            expectedVersion: expectedVersion ?? issue.version,
          })
          .then(() => undefined)
      }
      onDelete={() => {
        void deleteIssue.mutateAsync().catch(() => undefined);
      }}
      onRestore={() => {
        void restoreIssue.mutateAsync().catch(() => undefined);
      }}
      onAddComment={(body, operationId) =>
        addComment.mutateAsync({ body, operationId }).then(() => undefined)
      }
      onUploadFile={(file) => api.uploadFile(workspace.id, issue.id, file)}
      onCopyIdentifier={() =>
        void navigator.clipboard?.writeText(issue.identifier)
      }
    />
  );
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
): string | undefined {
  if (deleteError instanceof ApiError) return deleteError.message;
  if (restoreError instanceof ApiError) return restoreError.message;
  return deleteError || restoreError ? 'Could not update the issue' : undefined;
}

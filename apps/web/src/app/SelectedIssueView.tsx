import { api, ApiError } from '../api.ts';
import { IssueDetail } from '../components/IssueDetail.tsx';
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
  if (!issue || !workspace || !metadata.data) return null;
  return (
    <IssueDetail
      issue={issue}
      metadata={metadata.data}
      comments={comments.data ?? []}
      activity={activity.data ?? []}
      attachments={attachments.data ?? []}
      relations={relations.data ?? []}
      onSelectIssue={setSelectedIssueId}
      loading={comments.isLoading || activity.isLoading}
      actionError={
        deleteIssue.error instanceof ApiError
          ? deleteIssue.error.message
          : deleteIssue.error
            ? 'Could not delete the issue'
            : undefined
      }
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
        if (window.confirm(`Move ${issue.identifier} to trash?`))
          void deleteIssue.mutateAsync();
      }}
      onRestore={() => void restoreIssue.mutateAsync()}
      onAddComment={(body) =>
        addComment.mutateAsync(body).then(() => undefined)
      }
      onUploadFile={(file) => api.uploadFile(workspace.id, issue.id, file)}
      onCopyIdentifier={() =>
        void navigator.clipboard?.writeText(issue.identifier)
      }
    />
  );
}

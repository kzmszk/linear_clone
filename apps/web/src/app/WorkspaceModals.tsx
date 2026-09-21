import { CreateIssueModal } from '../components/CreateIssueModal.tsx';
import { WorkspaceDialog } from '../components/WorkspaceDialog.tsx';
import type { useWorkspaceController } from './useWorkspaceController.ts';

type Controller = ReturnType<typeof useWorkspaceController>;

export function WorkspaceModals({ controller }: { controller: Controller }) {
  const {
    metadata,
    teamId,
    showCreate,
    showWorkspaceCreate,
    setShowCreate,
    setShowWorkspaceCreate,
    createIssue,
    createWorkspace,
  } = controller;
  if (!metadata.data) return null;
  return (
    <>
      {showCreate ? (
        <CreateIssueModal
          metadata={metadata.data}
          defaultTeamId={teamId}
          onClose={() => setShowCreate(false)}
          onCreate={(input) =>
            createIssue.mutateAsync(input).then(() => undefined)
          }
        />
      ) : null}
      {showWorkspaceCreate ? (
        <WorkspaceDialog
          onClose={() => setShowWorkspaceCreate(false)}
          onCreate={(input) =>
            createWorkspace.mutateAsync(input).then(() => undefined)
          }
        />
      ) : null}
    </>
  );
}

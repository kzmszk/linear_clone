import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '../api.ts';
import { useArchiveRestore } from './useArchiveRestore.ts';
import type { useWorkspaceController } from './useWorkspaceController.ts';
import { ArchivedWorkspaceRows } from '../components/ArchiveResourceRows.tsx';
import { WorkspaceDialog } from '../components/WorkspaceDialog.tsx';
import { Button, ErrorNotice } from '../components/ui.tsx';

type Controller = ReturnType<typeof useWorkspaceController>;

export function ArchivedWorkspaceLanding({
  workspaces,
  controller,
}: {
  workspaces: Workspace[];
  controller: Controller;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const restore = useArchiveRestore(useQueryClient(), undefined);
  const canCreateWorkspace = controller.me.data?.isInstallationAdmin ?? false;
  const archived = workspaces.filter((item) => item.archivedAt);
  return (
    <main className="archive-landing archive-pane">
      <header className="settings-header">
        <div>
          <span className="eyebrow">Workspace access</span>
          <h1>Archived workspaces</h1>
          <p>Restore a workspace to continue, or create a new one.</p>
        </div>
        {canCreateWorkspace ? (
          <Button tone="primary" onClick={() => setCreateOpen(true)}>
            Create workspace
          </Button>
        ) : null}
      </header>
      {restore.error ? (
        <ErrorNotice message={messageFor(restore.error)} />
      ) : null}
      <ArchivedWorkspaceRows
        items={archived}
        pendingId={restore.variables?.id}
        onRestore={(target) =>
          restore.mutate(target, {
            onSuccess: () => controller.setView('issues'),
          })
        }
      />
      {createOpen && canCreateWorkspace ? (
        <WorkspaceDialog
          onClose={() => setCreateOpen(false)}
          onCreate={async (input) => {
            await controller.createWorkspace.mutateAsync(input);
            controller.setView('issues');
            setCreateOpen(false);
          }}
        />
      ) : null}
    </main>
  );
}

function messageFor(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Could not restore the workspace';
}

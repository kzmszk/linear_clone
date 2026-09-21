import { QueryClient } from '@tanstack/react-query';
import { BootstrapScreen } from './components/BootstrapScreen.tsx';
import { ErrorNotice, Loading } from './components/ui.tsx';
import { ApiError } from './api.ts';
import { useWorkspaceController } from './app/useWorkspaceController.ts';
import { WorkspaceLayout } from './app/WorkspaceLayout.tsx';
import './styles.css';

export function App() {
  const controller = useWorkspaceController();
  const { me, workspace, metadata, bootstrap } = controller;
  if (me.isLoading)
    return (
      <div className="app-loading">
        <Loading label="Connecting to your workspace" />
      </div>
    );
  if (me.isError)
    return (
      <div className="app-loading">
        <ErrorNotice
          message={
            me.error instanceof ApiError
              ? me.error.message
              : 'Could not connect to the workspace'
          }
          onRetry={() => void me.refetch()}
        />
      </div>
    );
  if (!me.data)
    return (
      <div className="app-loading">
        <Loading label="Loading account" />
      </div>
    );
  if (me.data.canBootstrap && me.data.workspaces.length === 0)
    return (
      <BootstrapScreen
        onBootstrap={async (input) => {
          await bootstrap.mutateAsync(input);
        }}
      />
    );
  if (me.data.workspaces.length === 0)
    return <NoWorkspaceAccess email={me.data.principal.email} />;
  if (!workspace || !metadata.data)
    return (
      <div className="app-loading">
        <Loading label="Loading workspace" />
        {metadata.isError ? (
          <ErrorNotice
            message={
              metadata.error instanceof ApiError
                ? metadata.error.message
                : 'Could not load workspace metadata'
            }
            onRetry={() => void metadata.refetch()}
          />
        ) : null}
      </div>
    );
  return <WorkspaceLayout controller={controller} />;
}

function NoWorkspaceAccess({ email }: { email: string }) {
  return (
    <main className="app-loading">
      <div className="empty-card">
        <h1>No workspace access</h1>
        <p>
          {email} is not a member of a workspace yet. Ask a workspace manager to
          invite you, then reload this page.
        </p>
      </div>
    </main>
  );
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 15_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

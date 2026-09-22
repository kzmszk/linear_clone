import { lazy, Suspense } from 'react';
import type { useWorkspaceController } from './useWorkspaceController.ts';
import { IssuesRoute } from './IssuesRoute.tsx';
import { ResponsiveSidebar } from '../components/ResponsiveSidebar.tsx';
import { Topbar } from './Topbar.tsx';
import { WorkspaceModals } from './WorkspaceModals.tsx';
import { Loading } from '../components/ui.tsx';

const LazySelectedIssueView = lazy(() =>
  import('./SelectedIssueView.tsx').then((module) => ({
    default: module.SelectedIssueView,
  })),
);
const LazySettingsRoute = lazy(() =>
  import('./SettingsRoute.tsx').then((module) => ({
    default: module.SettingsRoute,
  })),
);

type Controller = ReturnType<typeof useWorkspaceController>;

export function WorkspaceLayout({ controller }: { controller: Controller }) {
  const {
    workspace,
    metadata,
    me,
    selectedIssueId,
    view,
    teamId,
    projectId,
    search,
  } = controller;
  if (!workspace || !metadata.data || !me.data) return null;
  const title =
    controller.showTrash && view === 'issues'
      ? 'Trash'
      : workspaceTitle(view, teamId, projectId, metadata.data);
  return (
    <div
      className={`app-shell ${selectedIssueId && view === 'issues' ? 'has-detail' : ''}`}
    >
      <ResponsiveSidebar controller={controller} />
      <div
        className="main-column"
        hidden={Boolean(selectedIssueId) && view === 'issues'}
      >
        <Topbar
          workspaceName={workspace.name}
          title={title}
          search={search}
          onSearch={controller.setSearch}
          onCreate={() => controller.setShowCreate(true)}
        />
        <Suspense fallback={<RouteLoading />}>
          {view === 'settings' ? (
            <LazySettingsRoute controller={controller} />
          ) : (
            <IssuesRoute controller={controller} title={title} />
          )}
        </Suspense>
      </div>
      {selectedIssueId && view === 'issues' ? (
        <Suspense fallback={<RouteLoading />}>
          <LazySelectedIssueView controller={controller} />
        </Suspense>
      ) : null}
      <WorkspaceModals controller={controller} />
    </div>
  );
}

function RouteLoading() {
  return <Loading label="Loading view" />;
}

function workspaceTitle(
  view: 'issues' | 'settings',
  teamId: string | undefined,
  projectId: string | undefined,
  metadata: NonNullable<Controller['metadata']['data']>,
): string {
  if (view === 'settings') return 'Settings';
  if (teamId)
    return metadata.teams.find((item) => item.id === teamId)?.name ?? 'Issues';
  if (projectId)
    return (
      metadata.projects.find((item) => item.id === projectId)?.name ?? 'Issues'
    );
  return 'All issues';
}

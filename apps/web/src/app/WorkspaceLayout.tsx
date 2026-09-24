import { lazy, Suspense } from 'react';
import type { useWorkspaceController } from './useWorkspaceController.ts';
import { IssuesRoute } from './IssuesRoute.tsx';
import { ResponsiveSidebar } from '../components/ResponsiveSidebar.tsx';
import { Topbar } from './Topbar.tsx';
import { WorkspaceModals } from './WorkspaceModals.tsx';
import { ArchivedIssuesRoute } from './ArchivedIssuesRoute.tsx';
import { ArchivedResourcesRoute } from './ArchivedResourcesRoute.tsx';
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
  const { workspace, metadata, me, selectedIssueId, view, issueScope, search } =
    controller;
  if (!workspace || !metadata.data || !me.data) return null;
  const title = layoutTitle(controller, metadata.data);
  const showDetail = Boolean(selectedIssueId) && view === 'issues';
  return (
    <div className={`app-shell ${showDetail ? 'has-detail' : ''}`}>
      <ResponsiveSidebar controller={controller} />
      <div className="main-column" hidden={showDetail}>
        <Topbar
          workspaceName={workspace.name}
          title={title}
          search={search}
          showSearch={view === 'issues' && issueScope === 'active'}
          onSearch={controller.setSearch}
          onCreate={() => controller.setShowCreate(true)}
        />
        <Suspense fallback={<RouteLoading />}>
          <WorkspaceContent controller={controller} title={title} />
        </Suspense>
      </div>
      {showDetail ? (
        <Suspense fallback={<RouteLoading />}>
          <LazySelectedIssueView controller={controller} />
        </Suspense>
      ) : null}
      <WorkspaceModals controller={controller} />
    </div>
  );
}

function WorkspaceContent({
  controller,
  title,
}: {
  controller: Controller;
  title: string;
}) {
  if (controller.view === 'settings')
    return <LazySettingsRoute controller={controller} />;
  if (controller.view === 'archive')
    return <ArchivedResourcesRoute controller={controller} />;
  if (controller.issueScope === 'archived')
    return <ArchivedIssuesRoute controller={controller} />;
  return <IssuesRoute controller={controller} title={title} />;
}

function layoutTitle(
  controller: Controller,
  metadata: NonNullable<Controller['metadata']['data']>,
): string {
  if (controller.view === 'archive') return 'Archived';
  if (controller.view === 'settings') return 'Settings';
  if (controller.issueScope === 'trash') return 'Trash';
  if (controller.issueScope === 'archived') return 'Archived issues';
  return workspaceTitle(controller.teamId, controller.projectId, metadata);
}

function RouteLoading() {
  return <Loading label="Loading view" />;
}

function workspaceTitle(
  teamId: string | undefined,
  projectId: string | undefined,
  metadata: NonNullable<Controller['metadata']['data']>,
): string {
  if (teamId)
    return metadata.teams.find((item) => item.id === teamId)?.name ?? 'Issues';
  if (projectId)
    return (
      metadata.projects.find((item) => item.id === projectId)?.name ?? 'Issues'
    );
  return 'All issues';
}

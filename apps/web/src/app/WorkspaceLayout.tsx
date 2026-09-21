import { lazy, Suspense } from 'react';
import type { useWorkspaceController } from './useWorkspaceController.ts';
import { IssuesRoute } from './IssuesRoute.tsx';
import { Sidebar } from '../components/Sidebar.tsx';
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
    selectedIssue,
    view,
    settingsSection,
    teamId,
    projectId,
    search,
    darkMode,
    setWorkspaceId,
    setSelectedIssueId,
    setTeamId,
    setProjectId,
    setView,
    setSettingsSection,
    setSearch,
    setShowCreate,
    setShowWorkspaceCreate,
    setDarkMode,
  } = controller;
  if (!workspace || !metadata.data || !me.data) return null;
  const title = workspaceTitle(view, teamId, projectId, metadata.data);
  return (
    <div className={`app-shell ${selectedIssue.data ? 'has-detail' : ''}`}>
      <Sidebar
        workspace={workspace}
        workspaces={me.data.workspaces}
        teams={metadata.data.teams}
        projects={metadata.data.projects}
        activeTeamId={teamId}
        activeProjectId={projectId}
        view={view}
        settingsSection={settingsSection}
        darkMode={darkMode}
        onWorkspaceChange={(id) => {
          setWorkspaceId(id);
          setSelectedIssueId(undefined);
          setTeamId(undefined);
          setProjectId(undefined);
        }}
        onTeamChange={setTeamId}
        onProjectChange={setProjectId}
        onViewChange={setView}
        onSettingsChange={setSettingsSection}
        onCreateIssue={() => setShowCreate(true)}
        onCreateWorkspace={() => setShowWorkspaceCreate(true)}
        onToggleTheme={() => setDarkMode((current) => !current)}
      />
      <div className="main-column">
        <Topbar
          workspaceName={workspace.name}
          title={title}
          search={search}
          onSearch={setSearch}
          onCreate={() => setShowCreate(true)}
        />
        <Suspense fallback={<RouteLoading />}>
          {view === 'settings' ? (
            <LazySettingsRoute controller={controller} />
          ) : (
            <IssuesRoute controller={controller} />
          )}
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <LazySelectedIssueView controller={controller} />
      </Suspense>
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

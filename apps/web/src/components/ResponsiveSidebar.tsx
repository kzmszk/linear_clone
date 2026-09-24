import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { useWorkspaceController } from '../app/useWorkspaceController.ts';
import { Sidebar } from './Sidebar.tsx';

type Controller = ReturnType<typeof useWorkspaceController>;
type SidebarProps = Parameters<typeof Sidebar>[0];
type SidebarData = {
  workspace: NonNullable<Controller['workspace']>;
  workspaces: NonNullable<Controller['me']['data']>['workspaces'];
  teams: NonNullable<Controller['metadata']['data']>['teams'];
  projects: NonNullable<Controller['metadata']['data']>['projects'];
};

export function ResponsiveSidebar({ controller }: { controller: Controller }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const closeSidebar = () => setSidebarOpen(false);
  useEffect(() => {
    if (sidebarOpen && !wasOpen.current) {
      drawerRef.current
        ?.querySelector<HTMLElement>('select, button, [tabindex="0"]')
        ?.focus();
    }
    if (!sidebarOpen && wasOpen.current) menuButtonRef.current?.focus();
    wasOpen.current = sidebarOpen;
  }, [sidebarOpen]);
  const { workspace, metadata, me, activeWorkspaces } = controller;
  if (!workspace || !metadata.data || !me.data) return null;
  const data = {
    workspace,
    workspaces: activeWorkspaces ?? [],
    teams: metadata.data.teams,
    projects: metadata.data.projects,
  } satisfies SidebarData;
  return (
    <>
      <div
        ref={drawerRef}
        id="workspace-navigation"
        className={`sidebar-drawer ${sidebarOpen ? 'is-open' : ''}`}
        onKeyDown={(event) => closeOnEscape(event, closeSidebar)}
      >
        <Sidebar {...sidebarProps({ controller, closeSidebar, data })} />
      </div>
      {sidebarOpen ? (
        <button
          className="sidebar-backdrop"
          aria-label="Dismiss navigation"
          onClick={closeSidebar}
          onKeyDown={(event) => closeOnEscape(event, closeSidebar)}
        />
      ) : null}
      <button
        ref={menuButtonRef}
        className="mobile-menu-button"
        aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
        aria-controls="workspace-navigation"
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen((open) => !open)}
        onKeyDown={(event) => closeOnEscape(event, closeSidebar)}
      >
        {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
    </>
  );
}

function closeOnEscape(event: KeyboardEvent, closeSidebar: () => void) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  closeSidebar();
}

function sidebarProps({
  controller,
  closeSidebar,
  data,
}: {
  controller: Controller;
  closeSidebar: () => void;
  data: SidebarData;
}): SidebarProps {
  const { teamId, projectId, view, issueScope, settingsSection } = controller;
  return {
    ...data,
    activeTeamId: teamId,
    activeProjectId: projectId,
    view,
    issueScope,
    onIssueScopeChange: (scope) => {
      controller.setIssueScope(scope);
    },
    onArchiveSectionChange: (section) => {
      controller.setArchiveSection(section);
      closeSidebar();
    },
    settingsSection,
    darkMode: controller.darkMode,
    onWorkspaceChange: (id) => {
      controller.setWorkspaceId(id);
      closeSidebar();
    },
    onTeamChange: (id) => {
      controller.setTeamId(id);
      closeSidebar();
    },
    onProjectChange: (id) => {
      controller.setProjectId(id);
      closeSidebar();
    },
    onViewChange: (next) => {
      controller.setSelectedIssueId(undefined);
      controller.setView(next);
      if (next === 'issues') controller.setIssueScope('active');
      closeSidebar();
    },
    onSettingsChange: controller.setSettingsSection,
    onCreateIssue: () => {
      controller.setShowCreate(true);
      closeSidebar();
    },
    onCreateWorkspace: () => {
      controller.setShowWorkspaceCreate(true);
      closeSidebar();
    },
    onToggleTheme: () => controller.setDarkMode((current) => !current),
  };
}

import { ChevronDown, Layers3, Moon, Plus, Sun } from 'lucide-react';
import type { Project, Team, Workspace } from '../api.ts';
import { IconButton } from './ui.tsx';
import {
  ResourceSection,
  SidebarFooter,
  SidebarSettings,
} from './SidebarChrome.tsx';

export type SidebarView = 'issues' | 'settings';
export type SettingsSection =
  | 'overview'
  | 'workspaces'
  | 'teams'
  | 'projects'
  | 'members';
type SidebarProps = {
  workspace: Workspace;
  workspaces: Workspace[];
  teams: Team[];
  projects: Project[];
  activeTeamId: string | undefined;
  activeProjectId: string | undefined;
  view: SidebarView;
  settingsSection: SettingsSection;
  darkMode: boolean;
  onWorkspaceChange: (id: string) => void;
  onTeamChange: (id: string | undefined) => void;
  onProjectChange: (id: string | undefined) => void;
  onViewChange: (view: SidebarView) => void;
  onSettingsChange: (section: SettingsSection) => void;
  onCreateIssue: () => void;
  onCreateWorkspace: () => void;
  onToggleTheme: () => void;
};

export function Sidebar(props: SidebarProps) {
  const { workspace, workspaces, teams, projects, view, settingsSection } =
    props;
  return (
    <aside className="sidebar">
      <WorkspacePicker
        workspace={workspace}
        workspaces={workspaces}
        onChange={props.onWorkspaceChange}
      />
      <SidebarActions
        darkMode={props.darkMode}
        onCreate={props.onCreateIssue}
        onToggleTheme={props.onToggleTheme}
      />
      <MainNav
        view={view}
        activeTeamId={props.activeTeamId}
        activeProjectId={props.activeProjectId}
        onViewChange={props.onViewChange}
        onTeamChange={props.onTeamChange}
        onProjectChange={props.onProjectChange}
      />
      <ResourceSection
        title="Teams"
        onAdd={() => {
          props.onViewChange('settings');
          props.onSettingsChange('teams');
        }}
      >
        <TeamLinks
          teams={teams}
          activeTeamId={props.activeTeamId}
          view={view}
          onViewChange={props.onViewChange}
          onTeamChange={props.onTeamChange}
          onProjectChange={props.onProjectChange}
        />
      </ResourceSection>
      <ResourceSection
        title="Projects"
        onAdd={() => {
          props.onViewChange('settings');
          props.onSettingsChange('projects');
        }}
      >
        <ProjectLinks
          projects={projects}
          activeProjectId={props.activeProjectId}
          view={view}
          onViewChange={props.onViewChange}
          onProjectChange={props.onProjectChange}
          onTeamChange={props.onTeamChange}
        />
      </ResourceSection>
      <div className="sidebar-spacer" />
      <SidebarSettings
        view={view}
        section={settingsSection}
        onViewChange={props.onViewChange}
        onSettingsChange={props.onSettingsChange}
      />
      <SidebarFooter
        workspace={workspace}
        onCreateWorkspace={props.onCreateWorkspace}
      />
    </aside>
  );
}

function WorkspacePicker({
  workspace,
  workspaces,
  onChange,
}: {
  workspace: Workspace;
  workspaces: Workspace[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="workspace-picker">
      <select
        aria-label="Workspace"
        value={workspace.id}
        onChange={(event) => onChange(event.target.value)}
      >
        {workspaces.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="select-chevron" />
    </div>
  );
}

function SidebarActions({
  darkMode,
  onCreate,
  onToggleTheme,
}: {
  darkMode: boolean;
  onCreate: () => void;
  onToggleTheme: () => void;
}) {
  return (
    <div className="sidebar-actions">
      <button className="new-issue-button" onClick={onCreate}>
        <Plus size={16} />
        <span>New issue</span>
        <kbd>C</kbd>
      </button>
      <IconButton
        label={darkMode ? 'Use light theme' : 'Use dark theme'}
        onClick={onToggleTheme}
      >
        {darkMode ? <Sun size={16} /> : <Moon size={16} />}
      </IconButton>
    </div>
  );
}

function MainNav({
  view,
  activeTeamId,
  activeProjectId,
  onViewChange,
  onTeamChange,
  onProjectChange,
}: {
  view: SidebarView;
  activeTeamId: string | undefined;
  activeProjectId: string | undefined;
  onViewChange: (view: SidebarView) => void;
  onTeamChange: (id: string | undefined) => void;
  onProjectChange: (id: string | undefined) => void;
}) {
  return (
    <nav className="sidebar-nav" aria-label="Main navigation">
      <button
        className={
          view === 'issues' && !activeTeamId && !activeProjectId
            ? 'nav-item active'
            : 'nav-item'
        }
        onClick={() => {
          onViewChange('issues');
          onTeamChange(undefined);
          onProjectChange(undefined);
        }}
      >
        <Layers3 size={16} />
        <span>All issues</span>
      </button>
    </nav>
  );
}

function TeamLinks({
  teams,
  activeTeamId,
  view,
  onViewChange,
  onTeamChange,
  onProjectChange,
}: {
  teams: Team[];
  activeTeamId: string | undefined;
  view: SidebarView;
  onViewChange: (view: SidebarView) => void;
  onTeamChange: (id: string | undefined) => void;
  onProjectChange: (id: string | undefined) => void;
}) {
  if (teams.length === 0) return <p className="sidebar-empty">No teams yet</p>;
  return (
    <>
      {teams.map((team) => (
        <button
          key={team.id}
          className={`side-link ${activeTeamId === team.id && view === 'issues' ? 'active' : ''}`}
          onClick={() => {
            onViewChange('issues');
            onTeamChange(team.id);
            onProjectChange(undefined);
          }}
        >
          <span
            className="team-dot"
            style={{ backgroundColor: team.private ? '#f59e0b' : '#8b80f9' }}
          />
          <span>{team.name}</span>
          <span className="side-key">{team.key}</span>
        </button>
      ))}
    </>
  );
}

function ProjectLinks({
  projects,
  activeProjectId,
  view,
  onViewChange,
  onProjectChange,
  onTeamChange,
}: {
  projects: Project[];
  activeProjectId: string | undefined;
  view: SidebarView;
  onViewChange: (view: SidebarView) => void;
  onProjectChange: (id: string | undefined) => void;
  onTeamChange: (id: string | undefined) => void;
}) {
  if (projects.length === 0)
    return <p className="sidebar-empty">No projects yet</p>;
  return (
    <>
      {projects.map((project) => (
        <button
          key={project.id}
          className={`side-link ${activeProjectId === project.id && view === 'issues' ? 'active' : ''}`}
          onClick={() => {
            onViewChange('issues');
            onProjectChange(project.id);
            onTeamChange(undefined);
          }}
        >
          <span className="project-glyph" />
          <span>{project.name}</span>
        </button>
      ))}
    </>
  );
}

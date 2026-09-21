import { useState } from 'react';

export function useWorkspaceState() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [view, setView] = useState<'issues' | 'settings'>('issues');
  const [settingsSection, setSettingsSection] = useState<
    'overview' | 'workspaces' | 'teams' | 'projects' | 'members'
  >('overview');
  const [teamId, setTeamId] = useState<string>();
  const [projectId, setProjectId] = useState<string>();
  const [search, setSearch] = useState('');
  const [selectedIssueId, setSelectedIssueId] = useState<string>();
  const [showCreate, setShowCreate] = useState(false);
  const [showWorkspaceCreate, setShowWorkspaceCreate] = useState(false);
  const [darkMode, setDarkMode] = useState(
    () => window.localStorage.getItem('linear-clone-theme') === 'dark',
  );
  return {
    workspaceId,
    setWorkspaceId,
    view,
    setView,
    settingsSection,
    setSettingsSection,
    teamId,
    setTeamId,
    projectId,
    setProjectId,
    search,
    setSearch,
    selectedIssueId,
    setSelectedIssueId,
    showCreate,
    setShowCreate,
    showWorkspaceCreate,
    setShowWorkspaceCreate,
    darkMode,
    setDarkMode,
  };
}

import { useEffect, useState } from 'react';
import { useWorkspaceLocation } from './useWorkspaceLocation.ts';

export function useWorkspaceState() {
  const location = useWorkspaceLocation();
  const [view, setView] = useState<'issues' | 'settings'>('issues');
  const [settingsSection, setSettingsSection] = useState<
    'overview' | 'workspaces' | 'teams' | 'projects' | 'members'
  >('overview');
  const [teamId, setTeamId] = useState<string>();
  const [projectId, setProjectId] = useState<string>();
  const [search, setSearch] = useState('');
  const [showTrash, setShowTrash] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showWorkspaceCreate, setShowWorkspaceCreate] = useState(false);
  const [darkMode, setDarkMode] = useState(
    () => window.localStorage.getItem('linear-clone-theme') === 'dark',
  );
  useEffect(() => {
    setTeamId(undefined);
    setProjectId(undefined);
    setSearch('');
    setShowTrash(false);
  }, [location.workspaceId]);
  useEffect(() => {
    if (location.selectedIssueId) setView('issues');
  }, [location.selectedIssueId]);
  return {
    ...location,
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
    showTrash,
    setShowTrash,
    showCreate,
    setShowCreate,
    showWorkspaceCreate,
    setShowWorkspaceCreate,
    darkMode,
    setDarkMode,
  };
}

import { useCallback, useEffect, useState } from 'react';
import { useWorkspaceLocation } from './useWorkspaceLocation.ts';

export type IssueScope = 'active' | 'archived' | 'trash';
export type ArchiveSection =
  | 'issues'
  | 'projects'
  | 'teams'
  | 'labels'
  | 'statuses'
  | 'workspaces';
type ArchiveResourceSection = Exclude<ArchiveSection, 'issues'>;
type Navigation =
  | { kind: 'issues'; scope: IssueScope }
  | { kind: 'archive'; section: ArchiveResourceSection }
  | { kind: 'settings' };
export type WorkspaceView = Navigation['kind'];

export function useWorkspaceState() {
  const location = useWorkspaceLocation();
  const navigation = useWorkspaceNavigation();
  const [settingsSection, setSettingsSection] = useState<
    | 'overview'
    | 'workspaces'
    | 'teams'
    | 'projects'
    | 'members'
    | 'labels'
    | 'statuses'
  >('overview');
  const [teamId, setTeamId] = useState<string>();
  const [projectId, setProjectId] = useState<string>();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showWorkspaceCreate, setShowWorkspaceCreate] = useState(false);
  const [darkMode, setDarkMode] = useState(
    () => window.localStorage.getItem('linear-clone-theme') === 'dark',
  );
  useEffect(() => {
    setTeamId(undefined);
    setProjectId(undefined);
    setSearch('');
  }, [location.workspaceId]);
  return {
    ...location,
    ...navigation,
    settingsSection,
    setSettingsSection,
    teamId,
    setTeamId,
    projectId,
    setProjectId,
    search,
    setSearch,
    showCreate,
    setShowCreate,
    showWorkspaceCreate,
    setShowWorkspaceCreate,
    darkMode,
    setDarkMode,
  };
}

function useWorkspaceNavigation() {
  const [navigation, setNavigation] = useState<Navigation>({
    kind: 'issues',
    scope: 'active',
  });
  const view = navigation.kind;
  const issueScope =
    navigation.kind === 'issues'
      ? navigation.scope
      : navigation.kind === 'archive'
        ? 'archived'
        : 'active';
  const archiveSection: ArchiveSection | undefined =
    navigation.kind === 'archive'
      ? navigation.section
      : navigation.kind === 'issues' && navigation.scope === 'archived'
        ? 'issues'
        : undefined;
  const setView = useCallback((next: WorkspaceView) => {
    setNavigation(
      next === 'settings'
        ? { kind: 'settings' }
        : next === 'archive'
          ? { kind: 'issues', scope: 'archived' }
          : { kind: 'issues', scope: 'active' },
    );
  }, []);
  const setIssueScope = useCallback((scope: IssueScope) => {
    setNavigation({ kind: 'issues', scope });
  }, []);
  const setArchiveSection = useCallback((section: ArchiveSection) => {
    setNavigation(
      section === 'issues'
        ? { kind: 'issues', scope: 'archived' }
        : { kind: 'archive', section },
    );
  }, []);
  return {
    navigation,
    view,
    setView,
    issueScope,
    setIssueScope,
    archiveSection,
    setArchiveSection,
  };
}

import { api } from '../api.ts';
import { archiveApi } from '../archiveApi.ts';
import { classificationApi } from '../classificationApi.ts';
import type { SettingsSection } from '../components/Sidebar.tsx';
import {
  SettingsView,
  type SettingsViewProps,
} from '../components/SettingsView.tsx';
import type { useWorkspaceController } from './useWorkspaceController.ts';

type Controller = ReturnType<typeof useWorkspaceController>;

export function SettingsRoute({ controller }: { controller: Controller }) {
  const {
    workspace,
    metadata,
    me,
    settingsSection,
    queryClient,
    createWorkspace,
  } = controller;
  if (!workspace || !metadata.data || !me.data) return null;
  const section: SettingsSection = settingsSection;
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['metadata', workspace.id],
    });
    await queryClient.invalidateQueries({ queryKey: ['me'] });
  };
  const handlers = createSettingsHandlers(workspace.id, refresh, (input) =>
    createWorkspace.mutateAsync(input).then(() => undefined),
  );
  return (
    <SettingsView
      section={section}
      workspace={workspace}
      workspaces={controller.activeWorkspaces ?? []}
      teams={metadata.data.teams}
      projects={metadata.data.projects}
      members={metadata.data.members}
      labels={metadata.data.labels}
      states={metadata.data.states}
      {...handlers}
    />
  );
}

type SettingsHandlers = Pick<
  SettingsViewProps,
  | 'classificationActions'
  | 'onCreateWorkspace'
  | 'onUpdateWorkspace'
  | 'onArchiveWorkspace'
  | 'onCreateTeam'
  | 'onUpdateTeam'
  | 'onArchiveTeam'
  | 'onCreateProject'
  | 'onUpdateProject'
  | 'onArchiveProject'
  | 'onCreateMember'
  | 'onUpdateMember'
>;

function createSettingsHandlers(
  workspaceId: string,
  refresh: () => Promise<void>,
  onCreateWorkspace: SettingsViewProps['onCreateWorkspace'],
): SettingsHandlers {
  return {
    classificationActions: {
      onCreateLabel: (input) =>
        classificationApi.createLabel(workspaceId, input).then(refresh),
      onUpdateLabel: (id, input) =>
        classificationApi.updateLabel(workspaceId, id, input).then(refresh),
      onArchiveLabel: (id, expectedVersion) =>
        classificationApi
          .archiveLabel(workspaceId, id, expectedVersion)
          .then(refresh),
      onCreateState: (input) =>
        classificationApi.createState(workspaceId, input).then(refresh),
      onUpdateState: (id, input) =>
        classificationApi.updateState(workspaceId, id, input).then(refresh),
      onArchiveState: (id, expectedVersion) =>
        classificationApi
          .archiveState(workspaceId, id, expectedVersion)
          .then(refresh),
    },
    onCreateWorkspace,
    onUpdateWorkspace: (id, input) =>
      api.updateWorkspace(id, input).then(refresh),
    onArchiveWorkspace: (id, expectedVersion) =>
      archiveApi.archiveWorkspace(id, expectedVersion).then(refresh),
    onCreateTeam: (input) => api.createTeam(workspaceId, input).then(refresh),
    onUpdateTeam: (id, input) =>
      api.updateTeam(workspaceId, id, input).then(refresh),
    onArchiveTeam: (id, expectedVersion) =>
      archiveApi.archiveTeam(workspaceId, id, expectedVersion).then(refresh),
    onCreateProject: (input) =>
      api.createProject(workspaceId, input).then(refresh),
    onUpdateProject: (id, input) =>
      api.updateProject(workspaceId, id, input).then(refresh),
    onArchiveProject: (id, expectedVersion) =>
      archiveApi.archiveProject(workspaceId, id, expectedVersion).then(refresh),
    onCreateMember: (input) =>
      api.createMember(workspaceId, input).then(refresh),
    onUpdateMember: (id, input) =>
      api.updateMember(workspaceId, id, input).then(refresh),
  };
}

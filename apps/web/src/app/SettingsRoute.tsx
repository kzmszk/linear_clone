import { api } from '../api.ts';
import type { SettingsSection } from '../components/Sidebar.tsx';
import { SettingsView } from '../components/SettingsView.tsx';
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
  return (
    <SettingsView
      section={section}
      workspace={workspace}
      workspaces={me.data.workspaces}
      teams={metadata.data.teams}
      projects={metadata.data.projects}
      members={metadata.data.members}
      onCreateWorkspace={(input) =>
        createWorkspace.mutateAsync(input).then(() => undefined)
      }
      onUpdateWorkspace={(id, input) =>
        api.updateWorkspace(id, input).then(() => refresh())
      }
      onCreateTeam={(input) =>
        api.createTeam(workspace.id, input).then(refresh)
      }
      onUpdateTeam={(id, input) =>
        api.updateTeam(workspace.id, id, input).then(refresh)
      }
      onCreateProject={(input) =>
        api.createProject(workspace.id, input).then(refresh)
      }
      onUpdateProject={(id, input) =>
        api.updateProject(workspace.id, id, input).then(refresh)
      }
      onCreateMember={(input) =>
        api.createMember(workspace.id, input).then(refresh)
      }
      onUpdateMember={(id, input) =>
        api.updateMember(workspace.id, id, input).then(refresh)
      }
    />
  );
}

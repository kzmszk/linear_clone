import type { Member, Project, Team, Workspace } from '../api.ts';
import type { SettingsSection } from './Sidebar.tsx';
import { ErrorNotice } from './ui.tsx';
import { EditResourceDialog } from './settings/EditResourceDialog.tsx';
import { SettingsSectionContent } from './settings/SettingsSectionContent.tsx';
import { useSettingsActions } from './settings/useSettingsActions.ts';
import { useSettingsForm } from './settings/useSettingsForm.ts';

export type SettingsViewProps = {
  section: SettingsSection;
  workspace: Workspace;
  workspaces: Workspace[];
  teams: Team[];
  projects: Project[];
  members: Member[];
  onCreateWorkspace: (input: { name: string; slug: string }) => Promise<void>;
  onUpdateWorkspace: (
    id: string,
    input: { name?: string; slug?: string; expectedVersion: number },
  ) => Promise<void>;
  onCreateTeam: (input: {
    key: string;
    name: string;
    private: boolean;
  }) => Promise<void>;
  onUpdateTeam: (
    id: string,
    input: { name?: string; private?: boolean; expectedVersion: number },
  ) => Promise<void>;
  onCreateProject: (input: {
    name: string;
    description: string | null;
    status: string;
    teamIds: string[];
  }) => Promise<void>;
  onUpdateProject: (
    id: string,
    input: {
      name?: string;
      description?: string | null;
      status?: string;
      teamIds?: string[];
      expectedVersion: number;
    },
  ) => Promise<void>;
  onCreateMember: (input: {
    email: string;
    name: string;
    role: 'owner' | 'admin' | 'member';
    teamIds: string[];
  }) => Promise<void>;
  onUpdateMember: (
    id: string,
    input: {
      role?: 'owner' | 'admin' | 'member';
      active?: boolean;
      teamIds?: string[];
      expectedVersion: number;
    },
  ) => Promise<void>;
};

export function SettingsView({
  section,
  workspace,
  workspaces,
  teams,
  projects,
  members,
  onCreateWorkspace,
  onUpdateWorkspace,
  onCreateTeam,
  onUpdateTeam,
  onCreateProject,
  onUpdateProject,
  onCreateMember,
  onUpdateMember,
}: SettingsViewProps) {
  const form = useSettingsForm();
  const actions = useSettingsActions(form, {
    onCreateWorkspace,
    onUpdateWorkspace,
    onCreateTeam,
    onUpdateTeam,
    onCreateProject,
    onUpdateProject,
    onCreateMember,
    onUpdateMember,
  });
  const sectionTitle =
    section === 'overview'
      ? 'Workspace settings'
      : section[0].toUpperCase() + section.slice(1);
  return (
    <main className="settings-pane">
      <SettingsHeader workspace={workspace} title={sectionTitle} />
      {form.formError && !form.editing ? (
        <ErrorNotice message={form.formError} />
      ) : null}
      <SettingsSectionContent
        section={section}
        workspace={workspace}
        workspaces={workspaces}
        teams={teams}
        projects={projects}
        members={members}
        form={form}
        actions={actions}
      />
      {form.editing ? (
        <EditResourceDialog
          editing={form.editing}
          teams={teams}
          name={form.name}
          slug={form.slug}
          description={form.description}
          status={form.status}
          teamPrivate={form.teamPrivate}
          teamIds={form.teamIds}
          role={form.role}
          active={form.active}
          formError={form.formError}
          submitting={form.submitting}
          setEditing={form.setEditing}
          resetForm={form.resetForm}
          setName={form.setName}
          setSlug={form.setSlug}
          setDescription={form.setDescription}
          setStatus={form.setStatus}
          setTeamPrivate={form.setTeamPrivate}
          setTeamIds={form.setTeamIds}
          setRole={form.setRole}
          setActive={form.setActive}
          onSubmit={() => void actions.submitEdit()}
          onDeactivate={() => void actions.submitEdit(true)}
        />
      ) : null}
    </main>
  );
}

function SettingsHeader({
  workspace,
  title,
}: {
  workspace: Workspace;
  title: string;
}) {
  return (
    <header className="settings-header">
      <div>
        <span className="eyebrow">Settings · {workspace.name}</span>
        <h1>{title}</h1>
      </div>
      <span className="settings-version">Workspace v{workspace.version}</span>
    </header>
  );
}

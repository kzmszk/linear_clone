import type {
  Label,
  Member,
  Project,
  Team,
  WorkflowState,
  Workspace,
} from '../api.ts';
import type { SettingsSection } from './Sidebar.tsx';
import { ErrorNotice } from './ui.tsx';
import { EditResourceDialog } from './settings/EditResourceDialog.tsx';
import { ConfirmArchiveDialog } from './settings/ConfirmArchiveDialog.tsx';
import { SettingsSectionContent } from './settings/SettingsSectionContent.tsx';
import { useSettingsActions } from './settings/useSettingsActions.ts';
import { useSettingsArchive } from './settings/useSettingsArchive.ts';
import { useSettingsForm } from './settings/useSettingsForm.ts';
import type { ClassificationSettingsActions } from './settings/classificationTypes.ts';

export type SettingsViewProps = {
  section: SettingsSection;
  workspace: Workspace;
  workspaces: Workspace[];
  teams: Team[];
  projects: Project[];
  members: Member[];
  labels: Label[];
  states: WorkflowState[];
  classificationActions: ClassificationSettingsActions;
  onCreateWorkspace: (input: { name: string; slug: string }) => Promise<void>;
  onUpdateWorkspace: (
    id: string,
    input: { name?: string; slug?: string; expectedVersion: number },
  ) => Promise<void>;
  onArchiveWorkspace: (id: string, expectedVersion: number) => Promise<void>;
  onCreateTeam: (input: {
    key: string;
    name: string;
    private: boolean;
  }) => Promise<void>;
  onUpdateTeam: (
    id: string,
    input: { name?: string; private?: boolean; expectedVersion: number },
  ) => Promise<void>;
  onArchiveTeam: (id: string, expectedVersion: number) => Promise<void>;
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
  onArchiveProject: (id: string, expectedVersion: number) => Promise<void>;
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
  labels,
  states,
  classificationActions,
  onCreateWorkspace,
  onUpdateWorkspace,
  onArchiveWorkspace,
  onCreateTeam,
  onUpdateTeam,
  onArchiveTeam,
  onCreateProject,
  onUpdateProject,
  onArchiveProject,
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
  const archive = useSettingsArchive({
    onArchiveWorkspace,
    onArchiveTeam,
    onArchiveProject,
  });
  const sectionTitle =
    section === 'overview'
      ? 'Workspace settings'
      : section[0].toUpperCase() + section.slice(1);
  return (
    <main className="settings-pane">
      <SettingsHeader workspace={workspace} title={sectionTitle} />
      {form.formError && !form.editDraft && section === 'workspaces' ? (
        <ErrorNotice message={form.formError} />
      ) : null}
      <SettingsSectionContent
        section={section}
        workspace={workspace}
        workspaces={workspaces}
        teams={teams}
        projects={projects}
        members={members}
        labels={labels}
        states={states}
        classificationActions={classificationActions}
        form={form}
        actions={actions}
      />
      <SettingsResourceDialogs
        teams={teams}
        form={form}
        actions={actions}
        archive={archive}
      />
    </main>
  );
}

type SettingsForm = ReturnType<typeof useSettingsForm>;
type SettingsActions = ReturnType<typeof useSettingsActions>;
type SettingsArchive = ReturnType<typeof useSettingsArchive>;

function SettingsResourceDialogs({
  teams,
  form,
  actions,
  archive,
}: {
  teams: Team[];
  form: SettingsForm;
  actions: SettingsActions;
  archive: SettingsArchive;
}) {
  return (
    <>
      {form.editDraft ? (
        <EditResourceDialog
          draft={form.editDraft}
          teams={teams}
          formError={form.formError}
          submitting={form.submitting}
          onClose={form.closeEdit}
          onDraftChange={form.setEditDraft}
          onSubmit={() => void actions.submitEdit()}
          onDeactivate={() => void actions.submitEdit(true)}
          onArchive={(target) => {
            form.closeEdit();
            archive.request(target);
          }}
        />
      ) : null}
      {archive.target ? (
        <ConfirmArchiveDialog
          title={`Archive ${archive.target.kind}`}
          description={archiveDescription(archive.target.kind)}
          confirmLabel={`Archive ${archive.target.kind}`}
          error={archive.error}
          submitting={archive.submitting}
          onClose={archive.close}
          onConfirm={() => void archive.confirm()}
        />
      ) : null}
    </>
  );
}

function archiveDescription(kind: 'workspace' | 'team' | 'project') {
  if (kind === 'workspace')
    return 'This workspace will leave the workspace picker. Restore it from Archived.';
  if (kind === 'team')
    return 'This team will leave normal team views and issue selectors. Restore it from Archived.';
  return 'This project will leave normal project views and issue selectors. Restore it from Archived.';
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
    </header>
  );
}

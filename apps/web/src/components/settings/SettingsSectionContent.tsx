import type { Member, Project, Team, Workspace } from '../../api.ts';
import type { SettingsSection } from '../Sidebar.tsx';
import type { useSettingsActions } from './useSettingsActions.ts';
import type { useSettingsForm } from './useSettingsForm.ts';
import { MemberPanel } from './MemberPanel.tsx';
import { OverviewPanel } from './OverviewPanel.tsx';
import { ProjectPanel } from './ProjectPanel.tsx';
import { TeamPanel } from './TeamPanel.tsx';
import { WorkspacePanel } from './WorkspacePanel.tsx';

type Form = ReturnType<typeof useSettingsForm>;
type Actions = ReturnType<typeof useSettingsActions>;

export function SettingsSectionContent({
  section,
  workspace,
  workspaces,
  teams,
  projects,
  members,
  form,
  actions,
}: {
  section: SettingsSection;
  workspace: Workspace;
  workspaces: Workspace[];
  teams: Team[];
  projects: Project[];
  members: Member[];
  form: Form;
  actions: Actions;
}) {
  if (section === 'overview') {
    return (
      <OverviewPanel
        workspace={workspace}
        teams={teams}
        projects={projects}
        members={members}
      />
    );
  }
  if (section === 'workspaces') {
    return (
      <WorkspaceSettings
        workspaces={workspaces}
        form={form}
        actions={actions}
      />
    );
  }
  if (section === 'teams') {
    return <TeamSettings teams={teams} form={form} actions={actions} />;
  }
  if (section === 'projects') {
    return (
      <ProjectSettings
        projects={projects}
        teams={teams}
        form={form}
        actions={actions}
      />
    );
  }
  return (
    <MemberSettings
      members={members}
      teams={teams}
      form={form}
      actions={actions}
    />
  );
}

function WorkspaceSettings({
  workspaces,
  form,
  actions,
}: {
  workspaces: Workspace[];
  form: Form;
  actions: Actions;
}) {
  return (
    <WorkspacePanel
      workspaces={workspaces}
      name={form.name}
      slug={form.slug}
      onName={form.setName}
      onSlug={form.setSlug}
      submitting={form.submitting}
      onSubmit={() => void actions.submitCreate('workspace')}
      onCreate={form.resetForm}
      onEdit={form.beginEdit}
    />
  );
}

function TeamSettings({
  teams,
  form,
  actions,
}: {
  teams: Team[];
  form: Form;
  actions: Actions;
}) {
  return (
    <TeamPanel
      teams={teams}
      name={form.name}
      teamKey={form.teamKey}
      privateTeam={form.teamPrivate}
      formError={form.formError}
      onName={form.setName}
      onKey={form.setTeamKey}
      onPrivate={form.setTeamPrivate}
      submitting={form.submitting}
      onSubmit={() => actions.submitCreate('team')}
      onReset={form.resetForm}
      onEdit={form.beginEdit}
    />
  );
}

function ProjectSettings({
  projects,
  teams,
  form,
  actions,
}: {
  projects: Project[];
  teams: Team[];
  form: Form;
  actions: Actions;
}) {
  return (
    <ProjectPanel
      projects={projects}
      teams={teams}
      name={form.name}
      description={form.description}
      status={form.status}
      teamIds={form.teamIds}
      formError={form.formError}
      onName={form.setName}
      onDescription={form.setDescription}
      onStatus={form.setStatus}
      onTeamIds={form.setTeamIds}
      submitting={form.submitting}
      onSubmit={() => actions.submitCreate('project')}
      onReset={form.resetForm}
      onEdit={form.beginEdit}
    />
  );
}

function MemberSettings({
  members,
  teams,
  form,
  actions,
}: {
  members: Member[];
  teams: Team[];
  form: Form;
  actions: Actions;
}) {
  return (
    <MemberPanel
      members={members}
      teams={teams}
      name={form.name}
      email={form.email}
      role={form.role}
      teamIds={form.teamIds}
      formError={form.formError}
      onName={form.setName}
      onEmail={form.setEmail}
      onRole={form.setRole}
      onTeamIds={form.setTeamIds}
      submitting={form.submitting}
      onSubmit={() => actions.submitCreate('member')}
      onReset={form.resetForm}
      onEdit={form.beginEdit}
    />
  );
}

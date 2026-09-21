import type { EditTarget } from './types.ts';

export type SettingsFormValues = {
  name: string;
  slug: string;
  teamKey: string;
  teamPrivate: boolean;
  description: string;
  status: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  teamIds: string[];
  active: boolean;
};

export type SettingsSubmitActions = {
  onCreateWorkspace: (input: { name: string; slug: string }) => Promise<void>;
  onCreateTeam: (input: {
    key: string;
    name: string;
    private: boolean;
  }) => Promise<void>;
  onUpdateWorkspace: (
    id: string,
    input: { name?: string; slug?: string; expectedVersion: number },
  ) => Promise<void>;
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
    role: SettingsFormValues['role'];
    teamIds: string[];
  }) => Promise<void>;
  onUpdateMember: (
    id: string,
    input: {
      role?: SettingsFormValues['role'];
      active?: boolean;
      teamIds?: string[];
      expectedVersion: number;
    },
  ) => Promise<void>;
};

export async function createSettingsResource(
  kind: 'workspace' | 'team' | 'project' | 'member',
  form: SettingsFormValues,
  actions: SettingsSubmitActions,
): Promise<void> {
  if (kind === 'workspace') {
    await actions.onCreateWorkspace({
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
    });
    return;
  }
  if (kind === 'team') {
    await actions.onCreateTeam({
      name: form.name.trim(),
      key: form.teamKey.trim().toUpperCase(),
      private: form.teamPrivate,
    });
    return;
  }
  if (kind === 'project') {
    await actions.onCreateProject({
      name: form.name.trim(),
      description: form.description || null,
      status: form.status,
      teamIds: form.teamIds,
    });
    return;
  }
  await actions.onCreateMember({
    email: form.email.trim(),
    name: form.name.trim(),
    role: form.role,
    teamIds: form.teamIds,
  });
}

export async function updateSettingsResource(
  editing: EditTarget,
  form: SettingsFormValues,
  actions: SettingsSubmitActions,
  deactivate = false,
): Promise<void> {
  if (editing.kind === 'workspace') {
    await actions.onUpdateWorkspace(editing.item.id, {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      expectedVersion: editing.item.version,
    });
    return;
  }
  if (editing.kind === 'team') {
    await actions.onUpdateTeam(editing.item.id, {
      name: form.name.trim(),
      private: form.teamPrivate,
      expectedVersion: editing.item.version,
    });
    return;
  }
  if (editing.kind === 'project') {
    await actions.onUpdateProject(editing.item.id, {
      name: form.name.trim(),
      description: form.description || null,
      status: form.status,
      teamIds: form.teamIds,
      expectedVersion: editing.item.version,
    });
    return;
  }
  const pending = editing.item.userId === null;
  await actions.onUpdateMember(editing.item.id, {
    role: form.role,
    ...(deactivate || !pending
      ? { active: deactivate ? false : form.active }
      : {}),
    teamIds: form.teamIds,
    expectedVersion: editing.item.version,
  });
}

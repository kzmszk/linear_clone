import type { EditDraft } from './types.ts';

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
  draft: EditDraft,
  actions: SettingsSubmitActions,
  deactivate = false,
): Promise<void> {
  switch (draft.kind) {
    case 'workspace':
      await actions.onUpdateWorkspace(draft.item.id, {
        name: draft.name.trim(),
        slug: draft.slug.trim().toLowerCase(),
        expectedVersion: draft.item.version,
      });
      return;
    case 'team':
      await actions.onUpdateTeam(draft.item.id, {
        name: draft.name.trim(),
        private: draft.private,
        expectedVersion: draft.item.version,
      });
      return;
    case 'project':
      await actions.onUpdateProject(draft.item.id, {
        name: draft.name.trim(),
        description: draft.description || null,
        status: draft.status,
        teamIds: draft.teamIds,
        expectedVersion: draft.item.version,
      });
      return;
    case 'member': {
      const pending = draft.item.userId === null;
      await actions.onUpdateMember(draft.item.id, {
        role: draft.role,
        ...(deactivate || !pending
          ? { active: deactivate ? false : draft.active }
          : {}),
        teamIds: draft.teamIds,
        expectedVersion: draft.item.version,
      });
      return;
    }
  }
}

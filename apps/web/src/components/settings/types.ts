import type { Member, Project, Team, Workspace } from '../../api.ts';

export type EditTarget =
  | { kind: 'workspace'; item: Workspace }
  | { kind: 'team'; item: Team }
  | { kind: 'project'; item: Project }
  | { kind: 'member'; item: Member };

export type EditDraft =
  | {
      kind: 'workspace';
      item: Workspace;
      name: string;
      slug: string;
    }
  | {
      kind: 'team';
      item: Team;
      name: string;
      private: boolean;
    }
  | {
      kind: 'project';
      item: Project;
      name: string;
      description: string;
      status: string;
      teamIds: string[];
    }
  | {
      kind: 'member';
      item: Member;
      role: Member['role'];
      active: boolean;
      teamIds: string[];
    };

export function editDraftFromTarget(target: EditTarget): EditDraft {
  switch (target.kind) {
    case 'workspace':
      return {
        kind: 'workspace',
        item: target.item,
        name: target.item.name,
        slug: target.item.slug,
      };
    case 'team':
      return {
        kind: 'team',
        item: target.item,
        name: target.item.name,
        private: target.item.private,
      };
    case 'project':
      return {
        kind: 'project',
        item: target.item,
        name: target.item.name,
        description: target.item.description ?? '',
        status: target.item.status,
        teamIds: target.item.teamIds,
      };
    case 'member':
      return {
        kind: 'member',
        item: target.item,
        role: target.item.role,
        active: target.item.active,
        teamIds: target.item.teamIds,
      };
  }
}

export function memberRole(value: string): Member['role'] {
  if (value === 'owner' || value === 'admin') return value;
  return 'member';
}

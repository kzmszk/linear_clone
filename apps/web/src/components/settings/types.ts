import type { Member, Project, Team, Workspace } from '../../api.ts';

export type EditTarget =
  | { kind: 'workspace'; item: Workspace }
  | { kind: 'team'; item: Team }
  | { kind: 'project'; item: Project }
  | { kind: 'member'; item: Member };

export function memberRole(value: string): Member['role'] {
  if (value === 'owner' || value === 'admin') return value;
  return 'member';
}

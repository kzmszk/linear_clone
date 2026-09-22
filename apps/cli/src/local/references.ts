import type { Metadata } from '../../../../packages/contracts/src/index.ts';

export function resolveTeam(metadata: Metadata, reference: string) {
  const needle = reference.toLowerCase();
  return unique(
    metadata.teams.filter(
      (team) =>
        team.id === reference ||
        team.key.toLowerCase() === needle ||
        team.name.toLowerCase() === needle,
    ),
    `Team not found in workspace: ${reference}`,
  );
}

export function resolveState(
  metadata: Metadata,
  reference: string,
  teamId?: string,
): string {
  const needle = reference.toLowerCase();
  return unique(
    metadata.states.filter(
      (state) =>
        (!teamId || state.teamId === teamId) &&
        (state.id === reference || state.name.toLowerCase() === needle),
    ),
    `Workflow state not found: ${reference}`,
  ).id;
}

export function defaultState(metadata: Metadata, teamId: string): string {
  const state = metadata.states
    .filter((item) => item.teamId === teamId)
    .sort(
      (left, right) =>
        left.position - right.position || left.id.localeCompare(right.id),
    )[0];
  if (!state) throw new Error('The team has no workflow state.');
  return state.id;
}

export function resolveProject(
  metadata: Metadata,
  reference: string,
  teamId?: string,
): string {
  const needle = reference.toLowerCase();
  return unique(
    metadata.projects.filter(
      (project) =>
        project.archivedAt === null &&
        (!teamId || project.teamIds.includes(teamId)) &&
        (project.id === reference || project.name.toLowerCase() === needle),
    ),
    `Project not found in workspace: ${reference}`,
  ).id;
}

export function resolveAssignee(metadata: Metadata, reference: string): string {
  const needle = reference.toLowerCase();
  const member = unique(
    metadata.members.filter(
      (item) =>
        item.id === reference ||
        item.userId === reference ||
        item.email.toLowerCase() === needle ||
        item.name.toLowerCase() === needle,
    ),
    `Member not found in workspace: ${reference}`,
  );
  if (!member.userId)
    throw new Error(`Member has no active user account: ${reference}`);
  return member.userId;
}

export function resolveLabel(metadata: Metadata, reference: string): string {
  const needle = reference.toLowerCase();
  return unique(
    metadata.labels.filter(
      (label) => label.id === reference || label.name.toLowerCase() === needle,
    ),
    `Label not found: ${reference}`,
  ).id;
}

function unique<T>(values: T[], missing: string): T {
  if (values.length === 1) return values[0];
  if (values.length === 0) throw new Error(missing);
  throw new Error(`${missing.replace('not found', 'is ambiguous')}`);
}

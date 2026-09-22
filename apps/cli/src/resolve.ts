import {
  listRecords,
  queryPath,
  requestRecord,
  type ApiContext,
} from './api.ts';
import {
  issueListSchema,
  issueSchema,
  labelSchema,
  memberSchema,
  projectSchema,
  recordFromMutation,
  teamSchema,
  workspaceSchema,
  type Issue,
  type Label,
  type Member,
  type Project,
  type Team,
  type Workspace,
} from './types.ts';
import { cachedIssuePage } from './issue-list-cache.ts';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

async function listWorkspaces(api: ApiContext): Promise<Workspace[]> {
  return listRecords(api, '/workspaces', workspaceSchema);
}

export async function resolveWorkspace(
  api: ApiContext,
  ref: string | undefined,
): Promise<Workspace> {
  const workspaces = await listWorkspaces(api);
  if (ref) {
    const match = workspaces.find(
      (workspace) =>
        workspace.id === ref ||
        workspace.slug.toLowerCase() === ref.toLowerCase(),
    );
    if (match) return match;
    throw new Error(`Workspace not found: ${ref}`);
  }
  if (workspaces.length === 1) return workspaces[0];
  if (!workspaces.length)
    throw new Error(
      'No accessible workspaces. Run bootstrap or accept an invitation first.',
    );
  throw new Error('Select a workspace with --workspace <slug-or-id>.');
}

export async function listTeams(
  api: ApiContext,
  workspaceId: string,
): Promise<Team[]> {
  return listRecords(
    api,
    `/workspaces/${encodeURIComponent(workspaceId)}/teams`,
    teamSchema,
  );
}

export async function resolveTeam(
  api: ApiContext,
  workspaceId: string,
  ref: string,
): Promise<Team> {
  const { teams } = await api.metadata(workspaceId);
  const needle = ref.toLowerCase();
  const match = teams.find(
    (team) =>
      team.id === ref ||
      team.key.toLowerCase() === needle ||
      team.name.toLowerCase() === needle,
  );
  if (!match) throw new Error(`Team not found in workspace: ${ref}`);
  return match;
}

export async function listProjects(
  api: ApiContext,
  workspaceId: string,
): Promise<Project[]> {
  return listRecords(
    api,
    `/workspaces/${encodeURIComponent(workspaceId)}/projects`,
    projectSchema,
  );
}

export async function resolveProject(
  api: ApiContext,
  workspaceId: string,
  ref: string,
): Promise<Project> {
  const projects = (await api.metadata(workspaceId)).projects.filter(
    (project) => project.archivedAt === null,
  );
  const needle = ref.toLowerCase();
  const match = projects.find(
    (project) => project.id === ref || project.name.toLowerCase() === needle,
  );
  if (!match) throw new Error(`Project not found in workspace: ${ref}`);
  return match;
}

export async function listMembers(
  api: ApiContext,
  workspaceId: string,
): Promise<Member[]> {
  return listRecords(
    api,
    `/workspaces/${encodeURIComponent(workspaceId)}/members`,
    memberSchema,
  );
}

export async function resolveMember(
  api: ApiContext,
  workspaceId: string,
  ref: string,
): Promise<Member> {
  const { members } = await api.metadata(workspaceId);
  const needle = ref.toLowerCase();
  const match = members.find(
    (member) =>
      member.id === ref ||
      member.email.toLowerCase() === needle ||
      member.name.toLowerCase() === needle,
  );
  if (!match) throw new Error(`Member not found in workspace: ${ref}`);
  return match;
}

export async function resolveAssigneeId(
  api: ApiContext,
  workspaceId: string,
  ref: string,
): Promise<string> {
  const member = await resolveMember(api, workspaceId, ref);
  if (!member.userId)
    throw new Error(`Member has no active user account: ${ref}`);
  return member.userId;
}

export async function listLabels(
  api: ApiContext,
  workspaceId: string,
): Promise<Label[]> {
  return listRecords(
    api,
    `/workspaces/${encodeURIComponent(workspaceId)}/labels`,
    labelSchema,
  );
}

export async function resolveLabel(
  api: ApiContext,
  workspaceId: string,
  ref: string,
): Promise<Label> {
  const { labels } = await api.metadata(workspaceId);
  const needle = ref.toLowerCase();
  const match = labels.find(
    (label) => label.id === ref || label.name.toLowerCase() === needle,
  );
  if (!match) throw new Error(`Label not found: ${ref}`);
  return match;
}

export async function listIssues(
  api: ApiContext,
  workspaceRef: string,
  params: Record<string, string | undefined> = {},
): Promise<Issue[]> {
  const items: Issue[] = [];
  let cursor = params.cursor;
  const seen = new Set<string>();
  do {
    const path = queryPath(
      `/workspaces/${encodeURIComponent(workspaceRef)}/issues`,
      { ...params, cursor },
    );
    const value = cursor
      ? await api.client.request(path, issueListSchema)
      : await cachedIssuePage(api, path);
    items.push(...value.items);
    cursor = value.cursor ?? undefined;
    if (cursor && seen.has(cursor))
      throw new Error('Issue pagination cursor repeated.');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return items;
}

export async function getIssue(
  api: ApiContext,
  workspaceRef: string,
  ref: string,
): Promise<Issue> {
  const value = await requestRecord(
    api,
    `/workspaces/${encodeURIComponent(workspaceRef)}/issues/${encodeURIComponent(ref)}`,
    issueSchema,
  );
  return recordFromMutation(value);
}

export async function resolveIssueId(
  api: ApiContext,
  workspaceRef: string,
  ref: string,
): Promise<string> {
  return (await getIssue(api, workspaceRef, ref)).id;
}

export function parseRepeated(values: string[] | undefined): string[] {
  return (
    values?.flatMap((value) =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ) ?? []
  );
}

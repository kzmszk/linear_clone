import { z } from 'zod';
import { ApiError, createClient } from '../../../packages/client/src/index.ts';
import {
  activitySchema,
  attachmentSchema,
  commentSchema,
  fileUploadSchema,
  issuePageSchema,
  issueHierarchySchema,
  issuePatchSchema,
  issueRelationSchema,
  issueSchema,
  metadataSchema,
  meSchema,
  memberSchema,
  mutationSchema,
  newCommentSchema,
  newIssueSchema,
  newMemberSchema,
  newProjectSchema,
  newTeamSchema,
  newWorkspaceSchema,
  projectSchema,
  teamSchema,
  workspaceSchema,
} from '../../../packages/contracts/src/index.ts';
import { classificationApi } from './classificationApi.ts';
import type {
  Comment,
  Issue,
  IssuePatch,
  Member,
  Metadata,
  NewIssue,
  Project,
  Team,
  WorkflowState,
  Workspace,
} from '../../../packages/contracts/src/index.ts';

const client = createClient();

export type Activity = z.infer<typeof activitySchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type IssueRelation = z.infer<typeof issueRelationSchema>;
export type IssueHierarchy = z.infer<typeof issueHierarchySchema>;
export type FileUpload = z.infer<typeof fileUploadSchema>;
export type IssueFilters = {
  teamId?: string;
  projectId?: string;
  q?: string;
  stateId?: string;
  assigneeId?: string;
  deleted?: boolean;
  archived?: boolean;
  cursor?: string | null;
};

function resourcePath(
  workspaceId: string,
  resource: string,
  resourceId?: string,
): string {
  const base = `/workspaces/${workspaceId}`;
  return resource
    ? `${base}/${resource}${resourceId ? `/${resourceId}` : ''}`
    : base;
}

function queryPath(workspaceId: string, filters: IssueFilters): string {
  const params = new URLSearchParams();
  const entries: Array<[string, string | undefined]> = [
    ['teamId', filters.teamId],
    ['projectId', filters.projectId],
    ['q', filters.q],
    ['stateId', filters.stateId],
    ['assigneeId', filters.assigneeId],
    ['deleted', filters.deleted ? 'true' : undefined],
    ['archived', filters.archived ? 'true' : undefined],
    ['cursor', filters.cursor ?? undefined],
  ];
  entries.forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const suffix = params.toString();
  return `${resourcePath(workspaceId, 'issues')}${suffix ? `?${suffix}` : ''}`;
}

export const api = {
  ...classificationApi,
  getMe: () => client.request('/me', meSchema),
  bootstrap: (input: { name: string; slug: string }) =>
    client.request('/bootstrap', mutationSchema(workspaceSchema), {
      method: 'POST',
      body: newWorkspaceSchema.parse(input),
      operationId: crypto.randomUUID(),
    }),
  createWorkspace: (input: { name: string; slug: string }) =>
    client.request('/workspaces', mutationSchema(workspaceSchema), {
      method: 'POST',
      body: newWorkspaceSchema.parse(input),
      operationId: crypto.randomUUID(),
    }),
  updateWorkspace: (
    workspaceId: string,
    body: { name?: string; slug?: string; expectedVersion: number },
  ) =>
    client.request(
      resourcePath(workspaceId, ''),
      mutationSchema(workspaceSchema),
      {
        method: 'PATCH',
        body,
        operationId: crypto.randomUUID(),
      },
    ),
  deleteWorkspace: async (workspaceId: string, expectedVersion: number) =>
    client.request(resourcePath(workspaceId, ''), z.unknown(), {
      method: 'DELETE',
      body: { expectedVersion },
      operationId: crypto.randomUUID(),
    }),
  getMetadata: (workspaceId: string) =>
    client.request(`${resourcePath(workspaceId, 'metadata')}`, metadataSchema),
  listIssues: (workspaceId: string, filters: IssueFilters) =>
    client.request(queryPath(workspaceId, filters), issuePageSchema),
  getIssue: (workspaceId: string, issueId: string) =>
    client.request(resourcePath(workspaceId, 'issues', issueId), issueSchema),
  getIssueHierarchy: (workspaceId: string, issueId: string) =>
    client.request(
      resourcePath(workspaceId, 'issues', `${issueId}/hierarchy`),
      issueHierarchySchema,
    ),
  createIssue: (workspaceId: string, input: NewIssue) =>
    client.request(
      resourcePath(workspaceId, 'issues'),
      mutationSchema(issueSchema),
      {
        method: 'POST',
        body: newIssueSchema.parse(input),
        operationId: crypto.randomUUID(),
      },
    ),
  updateIssue: (workspaceId: string, issueId: string, input: IssuePatch) =>
    client.request(
      resourcePath(workspaceId, 'issues', issueId),
      mutationSchema(issueSchema),
      {
        method: 'PATCH',
        body: issuePatchSchema.parse(input),
        operationId: crypto.randomUUID(),
      },
    ),
  deleteIssue: async (
    workspaceId: string,
    issueId: string,
    expectedVersion: number,
  ) =>
    client.request(
      resourcePath(workspaceId, 'issues', issueId),
      mutationSchema(issueSchema),
      {
        method: 'DELETE',
        body: { expectedVersion },
        operationId: crypto.randomUUID(),
      },
    ),
  restoreIssue: (
    workspaceId: string,
    issueId: string,
    expectedVersion: number,
  ) =>
    client.request(
      resourcePath(workspaceId, 'issues', `${issueId}/restore`),
      mutationSchema(issueSchema),
      {
        method: 'POST',
        body: { expectedVersion },
        operationId: crypto.randomUUID(),
      },
    ),
  getComments: (workspaceId: string, issueId: string) =>
    client.request(
      resourcePath(workspaceId, 'issues', `${issueId}/comments`),
      z.array(commentSchema),
    ),
  addComment: (
    workspaceId: string,
    issueId: string,
    body: z.input<typeof newCommentSchema> & { operationId?: string },
  ) =>
    client.request(
      resourcePath(workspaceId, 'issues', `${issueId}/comments`),
      mutationSchema(commentSchema),
      {
        method: 'POST',
        body: newCommentSchema.parse(body),
        operationId: body.operationId ?? crypto.randomUUID(),
      },
    ),
  getActivity: (workspaceId: string, issueId: string) =>
    client.request(
      resourcePath(workspaceId, 'issues', `${issueId}/activity`),
      z.array(activitySchema),
    ),
  getAttachments: (workspaceId: string, issueId: string) =>
    client.request(
      resourcePath(workspaceId, 'issues', `${issueId}/attachments`),
      z.array(attachmentSchema),
    ),
  getRelations: (workspaceId: string, issueId: string) =>
    client.request(
      resourcePath(workspaceId, 'issues', `${issueId}/relations`),
      z.array(issueRelationSchema),
    ),
  uploadFile: (workspaceId: string, issueId: string, content: Blob) =>
    client.uploadFile(workspaceId, issueId, content),
  createTeam: (
    workspaceId: string,
    input: { key: string; name: string; private: boolean },
  ) =>
    client.request(
      resourcePath(workspaceId, 'teams'),
      mutationSchema(teamSchema),
      {
        method: 'POST',
        body: newTeamSchema.parse(input),
        operationId: crypto.randomUUID(),
      },
    ),
  updateTeam: (
    workspaceId: string,
    teamId: string,
    input: { name?: string; private?: boolean; expectedVersion: number },
  ) =>
    client.request(
      resourcePath(workspaceId, 'teams', teamId),
      mutationSchema(teamSchema),
      {
        method: 'PATCH',
        body: input,
        operationId: crypto.randomUUID(),
      },
    ),
  createProject: (
    workspaceId: string,
    input: {
      name: string;
      description: string | null;
      status: string;
      teamIds: string[];
    },
  ) =>
    client.request(
      resourcePath(workspaceId, 'projects'),
      mutationSchema(projectSchema),
      {
        method: 'POST',
        body: newProjectSchema.parse(input),
        operationId: crypto.randomUUID(),
      },
    ),
  updateProject: (
    workspaceId: string,
    projectId: string,
    input: {
      name?: string;
      description?: string | null;
      status?: string;
      teamIds?: string[];
      expectedVersion: number;
    },
  ) =>
    client.request(
      resourcePath(workspaceId, 'projects', projectId),
      mutationSchema(projectSchema),
      {
        method: 'PATCH',
        body: input,
        operationId: crypto.randomUUID(),
      },
    ),
  createMember: (
    workspaceId: string,
    input: {
      email: string;
      name: string;
      role: 'owner' | 'admin' | 'member';
      teamIds: string[];
    },
  ) =>
    client.request(
      resourcePath(workspaceId, 'members'),
      mutationSchema(memberSchema),
      {
        method: 'POST',
        body: newMemberSchema.parse(input),
        operationId: crypto.randomUUID(),
      },
    ),
  updateMember: (
    workspaceId: string,
    memberId: string,
    input: {
      role?: 'owner' | 'admin' | 'member';
      active?: boolean;
      teamIds?: string[];
      expectedVersion: number;
    },
  ) =>
    client.request(
      resourcePath(workspaceId, 'members', memberId),
      mutationSchema(memberSchema),
      {
        method: 'PATCH',
        body: input,
        operationId: crypto.randomUUID(),
      },
    ),
};

export { ApiError };
export type {
  Comment,
  Issue,
  IssuePatch,
  Member,
  Metadata,
  NewIssue,
  Project,
  Team,
  WorkflowState,
  Workspace,
};
export type Label = Metadata['labels'][number];

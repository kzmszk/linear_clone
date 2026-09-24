import { z } from 'zod';
import { createClient } from '../../../packages/client/src/index.ts';
import {
  issuePatchSchema,
  issueSchema,
  labelSchema,
  mutationSchema,
  projectSchema,
  stateSchema,
  teamSchema,
  versionInputSchema,
  workspaceSchema,
} from '../../../packages/contracts/src/index.ts';

const client = createClient();
const archivedAtPatchSchema = z.object({
  archivedAt: z.null(),
  expectedVersion: z.number().int().positive(),
});
const archivedCollectionPath = (workspaceId: string, resource: string) =>
  `/workspaces/${workspaceId}/${resource}?includeArchived=true`;
const itemPath = (workspaceId: string, resource: string, id: string) =>
  `/workspaces/${workspaceId}/${resource}/${id}`;

export type ArchivedLabel = z.infer<typeof labelSchema>;

export const archiveApi = {
  listTeams: (workspaceId: string) =>
    client.request(
      archivedCollectionPath(workspaceId, 'teams'),
      z.array(teamSchema),
    ),
  listProjects: (workspaceId: string) =>
    client.request(
      archivedCollectionPath(workspaceId, 'projects'),
      z.array(projectSchema),
    ),
  listStatuses: (workspaceId: string) =>
    client.request(
      archivedCollectionPath(workspaceId, 'states'),
      z.array(stateSchema),
    ),
  listLabels: (workspaceId: string) =>
    client.request(
      archivedCollectionPath(workspaceId, 'labels'),
      z.array(labelSchema),
    ),
  archiveWorkspace: (id: string, expectedVersion: number) =>
    client.request(`/workspaces/${id}`, mutationSchema(workspaceSchema), {
      method: 'DELETE',
      body: versionInputSchema.parse({ expectedVersion }),
      operationId: crypto.randomUUID(),
    }),
  restoreWorkspace: (id: string, expectedVersion: number) =>
    client.request(`/workspaces/${id}`, mutationSchema(workspaceSchema), {
      method: 'PATCH',
      body: archivedAtPatchSchema.parse({ archivedAt: null, expectedVersion }),
      operationId: crypto.randomUUID(),
    }),
  archiveTeam: (workspaceId: string, id: string, expectedVersion: number) =>
    client.request(
      itemPath(workspaceId, 'teams', id),
      mutationSchema(teamSchema),
      {
        method: 'DELETE',
        body: versionInputSchema.parse({ expectedVersion }),
        operationId: crypto.randomUUID(),
      },
    ),
  restoreTeam: (workspaceId: string, id: string, expectedVersion: number) =>
    client.request(
      itemPath(workspaceId, 'teams', id),
      mutationSchema(teamSchema),
      {
        method: 'PATCH',
        body: archivedAtPatchSchema.parse({
          archivedAt: null,
          expectedVersion,
        }),
        operationId: crypto.randomUUID(),
      },
    ),
  archiveProject: (workspaceId: string, id: string, expectedVersion: number) =>
    client.request(
      itemPath(workspaceId, 'projects', id),
      mutationSchema(projectSchema),
      {
        method: 'DELETE',
        body: versionInputSchema.parse({ expectedVersion }),
        operationId: crypto.randomUUID(),
      },
    ),
  restoreProject: (workspaceId: string, id: string, expectedVersion: number) =>
    client.request(
      itemPath(workspaceId, 'projects', id),
      mutationSchema(projectSchema),
      {
        method: 'PATCH',
        body: archivedAtPatchSchema.parse({
          archivedAt: null,
          expectedVersion,
        }),
        operationId: crypto.randomUUID(),
      },
    ),
  restoreStatus: (workspaceId: string, id: string, expectedVersion: number) =>
    client.request(
      itemPath(workspaceId, 'states', id),
      mutationSchema(stateSchema),
      {
        method: 'PATCH',
        body: archivedAtPatchSchema.parse({
          archivedAt: null,
          expectedVersion,
        }),
        operationId: crypto.randomUUID(),
      },
    ),
  restoreLabel: (workspaceId: string, id: string, expectedVersion: number) =>
    client.request(
      itemPath(workspaceId, 'labels', id),
      mutationSchema(labelSchema),
      {
        method: 'PATCH',
        body: archivedAtPatchSchema.parse({
          archivedAt: null,
          expectedVersion,
        }),
        operationId: crypto.randomUUID(),
      },
    ),
  archiveIssue: (workspaceId: string, id: string, expectedVersion: number) =>
    client.request(
      itemPath(workspaceId, 'issues', id),
      mutationSchema(issueSchema),
      {
        method: 'PATCH',
        body: issuePatchSchema.parse({
          archivedAt: new Date().toISOString(),
          expectedVersion,
        }),
        operationId: crypto.randomUUID(),
      },
    ),
  restoreIssue: (workspaceId: string, id: string, expectedVersion: number) =>
    client.request(
      itemPath(workspaceId, 'issues', id),
      mutationSchema(issueSchema),
      {
        method: 'PATCH',
        body: issuePatchSchema.parse({ archivedAt: null, expectedVersion }),
        operationId: crypto.randomUUID(),
      },
    ),
};

import { createClient } from '../../../packages/client/src/index.ts';
import {
  labelSchema,
  mutationSchema,
  newLabelSchema,
  newStateSchema,
  statePatchSchema,
  stateSchema,
} from '../../../packages/contracts/src/index.ts';

const client = createClient();

function path(workspaceId: string, resource: 'states' | 'labels', id?: string) {
  return `/workspaces/${workspaceId}/${resource}${id ? `/${id}` : ''}`;
}

export const classificationApi = {
  createState: (
    workspaceId: string,
    input: {
      teamId: string;
      name: string;
      type: string;
      color: string;
      position: number;
    },
  ) =>
    client.request(path(workspaceId, 'states'), mutationSchema(stateSchema), {
      method: 'POST',
      body: newStateSchema.parse(input),
      operationId: crypto.randomUUID(),
    }),
  updateState: (
    workspaceId: string,
    stateId: string,
    input: {
      name?: string;
      type?:
        | 'triage'
        | 'backlog'
        | 'unstarted'
        | 'started'
        | 'completed'
        | 'canceled';
      color?: string;
      position?: number;
      expectedVersion: number;
    },
  ) =>
    client.request(
      path(workspaceId, 'states', stateId),
      mutationSchema(stateSchema),
      {
        method: 'PATCH',
        body: statePatchSchema.parse(input),
        operationId: crypto.randomUUID(),
      },
    ),
  archiveState: (
    workspaceId: string,
    stateId: string,
    expectedVersion: number,
  ) =>
    client.request(
      path(workspaceId, 'states', stateId),
      mutationSchema(stateSchema),
      {
        method: 'DELETE',
        body: { expectedVersion },
        operationId: crypto.randomUUID(),
      },
    ),
  createLabel: (workspaceId: string, input: { name: string; color: string }) =>
    client.request(path(workspaceId, 'labels'), mutationSchema(labelSchema), {
      method: 'POST',
      body: newLabelSchema.parse(input),
      operationId: crypto.randomUUID(),
    }),
  updateLabel: (
    workspaceId: string,
    labelId: string,
    input: { name?: string; color?: string; expectedVersion: number },
  ) =>
    client.request(
      path(workspaceId, 'labels', labelId),
      mutationSchema(labelSchema),
      {
        method: 'PATCH',
        body: input,
        operationId: crypto.randomUUID(),
      },
    ),
  archiveLabel: (
    workspaceId: string,
    labelId: string,
    expectedVersion: number,
  ) =>
    client.request(
      path(workspaceId, 'labels', labelId),
      mutationSchema(labelSchema),
      {
        method: 'DELETE',
        body: { expectedVersion },
        operationId: crypto.randomUUID(),
      },
    ),
};

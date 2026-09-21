import { z } from 'zod';
import {
  activitySchema,
  commentSchema,
  issuePageSchema,
  issueSchema,
  labelSchema,
  memberSchema,
  metadataSchema,
  meSchema,
  mutationSchema,
  projectSchema,
  stateSchema,
  teamSchema,
  workspaceSchema,
} from '../../../packages/contracts/src/index.ts';

export {
  activitySchema,
  commentSchema,
  issueSchema,
  labelSchema,
  memberSchema,
  metadataSchema,
  meSchema,
  projectSchema,
  stateSchema,
  teamSchema,
  workspaceSchema,
  mutationSchema,
};
export type {
  Comment,
  Issue,
  Member,
  Metadata,
  Project,
  Team,
  WorkflowState,
  Workspace,
} from '../../../packages/contracts/src/index.ts';
export type Label = z.infer<typeof labelSchema>;

export const emptySchema = z.object({}).passthrough();
export const issueListSchema = issuePageSchema;
export const jsonObjectSchema = z.record(z.string(), z.unknown());

export function recordFromMutation<T extends { id?: string }>(
  value: T | { current: T },
): T {
  return 'current' in value ? value.current : value;
}

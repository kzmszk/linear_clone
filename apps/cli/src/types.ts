import * as z from 'zod';
import {
  commentSchema,
  issuePageSchema,
  issueSchema,
  labelSchema,
  memberSchema,
  mutationSchema,
  projectSchema,
  teamSchema,
  workspaceSchema,
} from '../../../packages/contracts/src/index.ts';

export {
  commentSchema,
  issueSchema,
  labelSchema,
  memberSchema,
  projectSchema,
  teamSchema,
  workspaceSchema,
  mutationSchema,
};
export type {
  Issue,
  Member,
  Project,
  Team,
  Workspace,
} from '../../../packages/contracts/src/index.ts';
export type Label = z.infer<typeof labelSchema>;
export const issueListSchema = issuePageSchema;

export function recordFromMutation<T extends { id?: string }>(
  value: T | { current: T },
): T {
  return 'current' in value ? value.current : value;
}

import { z } from 'zod';

export const id = z.string().uuid();
export const version = z.number().int().positive();
export const role = z.enum(['owner', 'admin', 'member']);
export const principalSchema = z.object({
  subject: z.string(),
  email: z.email(),
});
export type Principal = z.infer<typeof principalSchema>;
const base = { id, version, createdAt: z.string(), updatedAt: z.string() };
export const workspaceSchema = z.object({
  ...base,
  slug: z.string(),
  name: z.string(),
  archivedAt: z.string().nullable(),
});
export const teamSchema = z.object({
  ...base,
  workspaceId: id,
  key: z.string(),
  name: z.string(),
  private: z.boolean(),
  archivedAt: z.string().nullable(),
});
export const projectSchema = z.object({
  ...base,
  workspaceId: id,
  name: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  teamIds: z.array(id),
  archivedAt: z.string().nullable(),
});
export const memberSchema = z.object({
  ...base,
  userId: id.nullable(),
  workspaceId: id,
  email: z.email(),
  name: z.string(),
  role,
  active: z.boolean(),
  teamIds: z.array(id),
});
export const stateSchema = z.object({
  ...base,
  workspaceId: id,
  teamId: id,
  name: z.string(),
  type: z.string(),
  color: z.string(),
  position: z.number(),
});
export const labelSchema = z.object({
  ...base,
  workspaceId: id,
  name: z.string(),
  color: z.string(),
});
export const issueSchema = z.object({
  ...base,
  workspaceId: id,
  teamId: id,
  identifier: z.string(),
  number: z.number().int(),
  title: z.string(),
  description: z.string().nullable(),
  stateId: id,
  priority: z.number().int().min(0).max(4),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable().default(null),
  projectId: id.nullable(),
  parentId: id.nullable(),
  estimate: z.number().nullable(),
  dueDate: z.string().nullable(),
  labelIds: z.array(id),
  archivedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  canceledAt: z.string().nullable(),
  sourceId: z.string().nullable(),
});
export const commentSchema = z.object({
  ...base,
  workspaceId: id,
  issueId: id,
  body: z.string(),
  authorName: z.string(),
  parentCommentId: id.nullable(),
  deletedAt: z.string().nullable(),
});
export const activitySchema = z.object({
  id: z.string(),
  issueId: id,
  actor: z.string(),
  action: z.string(),
  createdAt: z.string(),
  source: z.boolean(),
});
export const meSchema = z.object({
  principal: principalSchema,
  isInstallationAdmin: z.boolean(),
  canBootstrap: z.boolean(),
  workspaces: z.array(workspaceSchema),
});
export const metadataSchema = z.object({
  teams: z.array(teamSchema),
  projects: z.array(projectSchema),
  members: z.array(memberSchema),
  states: z.array(stateSchema),
  labels: z.array(labelSchema),
});
export const issuePageSchema = z.object({
  items: z.array(issueSchema),
  cursor: z.string().nullable(),
});
export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    current: z.unknown().optional(),
  }),
});
export const fileUploadSchema = z.object({
  url: z.string(),
  checksum: z.string(),
  size: z.number(),
  contentType: z.string(),
});
export const receiptSchema = z.object({
  operationId: id,
  entityId: z.string(),
  version,
  sequence: z.number().int(),
});
export function mutationSchema<T extends z.ZodType>(record: T) {
  return z.object({
    kind: z.enum(['committed', 'replayed']),
    receipt: receiptSchema,
    current: record,
  });
}
export const newWorkspaceSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1).max(120),
});
export const newTeamSchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9]{0,9}$/),
  name: z.string().trim().min(1).max(120),
  private: z.boolean().default(false),
});
export const newProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().nullable().default(null),
  status: z.string().default('planned'),
  teamIds: z.array(id).default([]),
});
export const newMemberSchema = z.object({
  email: z.email(),
  name: z.string().default(''),
  role: role.default('member'),
  teamIds: z.array(id).default([]),
});
export const newStateSchema = z.object({
  teamId: id,
  name: z.string().min(1),
  type: z.string().default('unstarted'),
  color: z.string().default('#9095a2'),
  position: z.number().default(0),
});
export const newLabelSchema = z.object({
  name: z.string().min(1),
  color: z.string().default('#8b80f9'),
});
const editableIssueFields = {
  title: z.string().trim().min(1).max(500),
  description: z.string().max(1000000).nullable(),
  stateId: id,
  priority: z.number().int().min(0).max(4),
  assigneeId: z.string().nullable(),
  projectId: id.nullable(),
  parentId: id.nullable(),
  estimate: z.number().nullable(),
  dueDate: z.string().nullable(),
  labelIds: z.array(id),
};
export const newIssueSchema = z.object({
  ...editableIssueFields,
  teamId: id,
  description: editableIssueFields.description.default(null),
  stateId: id.optional(),
  priority: editableIssueFields.priority.default(0),
  assigneeId: editableIssueFields.assigneeId.default(null),
  projectId: editableIssueFields.projectId.default(null),
  parentId: editableIssueFields.parentId.default(null),
  estimate: editableIssueFields.estimate.default(null),
  dueDate: editableIssueFields.dueDate.default(null),
  labelIds: editableIssueFields.labelIds.default([]),
});
export const issuePatchSchema = z.object(editableIssueFields).partial().extend({
  expectedVersion: version,
  archivedAt: z.string().nullable().optional(),
});
export const newCommentSchema = z.object({
  body: z.string().min(1).max(100000),
  parentCommentId: id.nullable().default(null),
});
export const versionInputSchema = z.object({ expectedVersion: version });
export type Workspace = z.infer<typeof workspaceSchema>;
export type Team = z.infer<typeof teamSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Member = z.infer<typeof memberSchema>;
export type WorkflowState = z.infer<typeof stateSchema>;
export type Issue = z.infer<typeof issueSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type Metadata = z.infer<typeof metadataSchema>;
export type NewIssue = z.input<typeof newIssueSchema>;
export type IssuePatch = z.input<typeof issuePatchSchema>;

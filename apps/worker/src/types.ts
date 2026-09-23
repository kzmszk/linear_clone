import type { SqlStorage, SqlStorageValue } from '@cloudflare/workers-types';

export type SqlDb = SqlStorage;
export type SqlRow = Record<string, SqlStorageValue>;

export type WorkerEnv = {
  TRACKER: DurableObjectNamespace;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  BOOTSTRAP_OWNER_EMAIL: string;
};

export type AuthActor = {
  issuer: string;
  subject: string;
  email: string;
};

export type UserRow = SqlRow & {
  id: string;
  access_issuer: string;
  access_subject: string;
  verified_email: string;
  name: string;
  created_at: string;
};

export type WorkspaceMembershipRow = SqlRow & {
  id: string;
  workspace_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  active: number;
  version: number;
  created_at: string;
  updated_at: string;
};

export type WorkspaceRow = SqlRow & {
  id: string;
  slug: string;
  name: string;
  version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type TeamRow = SqlRow & {
  id: string;
  workspace_id: string;
  team_key: string;
  name: string;
  private: number;
  next_issue_number: number;
  version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ProjectRow = SqlRow & {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type StateRow = SqlRow & {
  id: string;
  workspace_id: string;
  team_id: string;
  name: string;
  type: string;
  color: string;
  position: number;
  version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type LabelRow = SqlRow & {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type IssueRow = SqlRow & {
  id: string;
  workspace_id: string;
  team_id: string;
  team_key: string;
  issue_number: number;
  title: string;
  description: string | null;
  state_id: string;
  priority: number;
  assignee_id: string | null;
  assignee_name: string | null;
  project_id: string | null;
  parent_id: string | null;
  estimate: number | null;
  due_date: string | null;
  source_assignee_id: string | null;
  source_assignee_name: string | null;
  source_parent_issue_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  source_id: string | null;
};

export type CommentRow = SqlRow & {
  id: string;
  workspace_id: string;
  issue_id: string;
  body: string;
  author_id: string | null;
  author_name: string;
  source_author_id: string | null;
  source_parent_comment_id: string | null;
  parent_comment_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ActivityRow = SqlRow & {
  id: string;
  workspace_id: string;
  issue_id: string;
  actor: string;
  action: string;
  created_at: string;
  source: number;
  source_id: string | null;
};

export type MutationReceipt = {
  operationId: string;
  entityId: string;
  version: number;
  sequence: number;
};

export type MutationResponse<T> = {
  kind: 'committed' | 'replayed';
  receipt: MutationReceipt;
  current: T;
};

export type AppliedMutation<T> = {
  entityKind: string;
  entityId: string;
  version: number;
  current: T;
  payload: Record<string, string | number | boolean | null>;
};

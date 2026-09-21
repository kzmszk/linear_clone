import { z } from 'zod';
import { labelSchema } from '../../../../packages/contracts/src/index.ts';
import type {
  Member,
  Project,
  Team,
  WorkflowState,
  Workspace,
} from '../../../../packages/contracts/src/index.ts';
type Label = z.infer<typeof labelSchema>;
import type {
  LabelRow,
  ProjectRow,
  StateRow,
  TeamRow,
  UserRow,
  WorkspaceMembershipRow,
  WorkspaceRow,
} from '../types.ts';

export function workspaceRecord(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    slug: row.slug,
    name: row.name,
    archivedAt: row.archived_at,
  };
}

export function teamRecord(row: TeamRow): Team {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id,
    key: row.team_key,
    name: row.name,
    private: row.private === 1,
    archivedAt: row.archived_at,
  };
}

export function projectRecord(row: ProjectRow, teamIds: string[]): Project {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    status: row.status,
    teamIds,
    archivedAt: row.archived_at,
  };
}

export function memberRecord(
  row: WorkspaceMembershipRow,
  user: UserRow,
  teamIds: string[],
): Member {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id,
    userId: user.id,
    email: user.verified_email,
    name: user.name,
    role: row.role,
    active: row.active === 1,
    teamIds,
  };
}

export function stateRecord(row: StateRow): WorkflowState {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id,
    teamId: row.team_id,
    name: row.name,
    type: row.type,
    color: row.color,
    position: row.position,
  };
}

export function labelRecord(row: LabelRow): Label {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id,
    name: row.name,
    color: row.color,
  };
}

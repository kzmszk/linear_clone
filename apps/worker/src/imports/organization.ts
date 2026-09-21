import { newId, one } from '../db.ts';
import type { AuthActor, SqlDb, SqlRow } from '../types.ts';
import {
  booleanValue,
  invalidItem,
  nestedId,
  nestedIds,
  numberValue,
  record,
  requireDestination,
  sourceDestination,
  sourceTime,
  text,
} from './values.ts';
import type { ImportBatch, ImportItem } from './types.ts';

export function normalizeTeam(
  sql: SqlDb,
  workspaceId: string,
  item: ImportItem,
  timestamp: string,
  actor: AuthActor,
): string {
  const key = text(item.payload, 'key') ?? text(item.payload, 'identifier');
  const name = text(item.payload, 'name');
  if (key === null || name === null)
    invalidItem(item, 'team key and name are required');
  const existing = one<{ id: string } & SqlRow>(
    sql,
    'SELECT id FROM teams WHERE workspace_id = ? AND team_key = ?',
    workspaceId,
    key,
  );
  if (existing !== null) return existing.id;
  const teamId = newId();
  sql.exec(
    'INSERT INTO teams (id, workspace_id, team_key, name, private, next_issue_number, version, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?, ?)',
    teamId,
    workspaceId,
    key,
    name,
    booleanValue(item.payload, 'private') ? 1 : 0,
    sourceTime(item.payload, 'createdAt', timestamp),
    sourceTime(item.payload, 'updatedAt', timestamp),
    text(item.payload, 'archivedAt'),
  );
  const user = one<{ id: string } & SqlRow>(
    sql,
    'SELECT id FROM users WHERE access_issuer = ? AND access_subject = ?',
    actor.issuer,
    actor.subject,
  );
  if (user !== null)
    sql.exec(
      'INSERT OR IGNORE INTO team_memberships (id, workspace_id, team_id, user_id, created_at) VALUES (?, ?, ?, ?, ?)',
      newId(),
      workspaceId,
      teamId,
      user.id,
      timestamp,
    );
  return teamId;
}

function normalizeState(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
  timestamp: string,
): string | null {
  const teamId = sourceDestination(
    sql,
    workspaceId,
    batch,
    'team',
    nestedId(item.payload, 'team'),
  );
  if (teamId === null) return null;
  const stateId = insertStatePayload(
    sql,
    workspaceId,
    item.payload,
    teamId,
    timestamp,
  );
  markSourceDestination(
    sql,
    workspaceId,
    batch,
    'state',
    item.sourceId,
    stateId,
  );
  return stateId;
}

export function ensureIssueState(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
  teamId: string,
  timestamp: string,
): string {
  const stateSourceId = nestedId(item.payload, 'state');
  const stateId = sourceDestination(
    sql,
    workspaceId,
    batch,
    'state',
    stateSourceId,
  );
  if (stateId !== null) return stateId;
  const state = record(item.payload)?.state;
  if (stateSourceId === null || state === undefined)
    return firstState(sql, teamId, item);
  const created = insertStatePayload(
    sql,
    workspaceId,
    state,
    teamId,
    timestamp,
  );
  markSourceDestination(
    sql,
    workspaceId,
    batch,
    'state',
    stateSourceId,
    created,
  );
  return created;
}

function insertStatePayload(
  sql: SqlDb,
  workspaceId: string,
  payload: unknown,
  teamId: string,
  timestamp: string,
): string {
  const name = text(payload, 'name');
  if (name === null) throw new Error('Imported state is missing a name');
  const existing = one<{ id: string } & SqlRow>(
    sql,
    'SELECT id FROM workflow_states WHERE team_id = ? AND name = ?',
    teamId,
    name,
  );
  if (existing !== null) return existing.id;
  const stateId = newId();
  sql.exec(
    'INSERT INTO workflow_states (id, workspace_id, team_id, name, type, color, position, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
    stateId,
    workspaceId,
    teamId,
    name,
    text(payload, 'type') ?? 'unstarted',
    text(payload, 'color') ?? '#9095a2',
    numberValue(payload, 'position') ?? 0,
    sourceTime(payload, 'createdAt', timestamp),
    sourceTime(payload, 'updatedAt', timestamp),
  );
  return stateId;
}

function firstState(sql: SqlDb, teamId: string, item: ImportItem): string {
  const state = one<{ id: string } & SqlRow>(
    sql,
    'SELECT id FROM workflow_states WHERE team_id = ? ORDER BY position, id LIMIT 1',
    teamId,
  );
  if (state === null) invalidItem(item, 'issue team has no workflow state');
  return state.id;
}

function normalizeLabel(
  sql: SqlDb,
  workspaceId: string,
  item: ImportItem,
  timestamp: string,
): string {
  const name = text(item.payload, 'name');
  if (name === null) invalidItem(item, 'label name is required');
  const existing = one<{ id: string } & SqlRow>(
    sql,
    'SELECT id FROM labels WHERE workspace_id = ? AND name = ?',
    workspaceId,
    name,
  );
  if (existing !== null) return existing.id;
  const labelId = newId();
  sql.exec(
    'INSERT INTO labels (id, workspace_id, name, color, version, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
    labelId,
    workspaceId,
    name,
    text(item.payload, 'color') ?? '#8b80f9',
    sourceTime(item.payload, 'createdAt', timestamp),
    sourceTime(item.payload, 'updatedAt', timestamp),
    text(item.payload, 'archivedAt'),
  );
  return labelId;
}

function normalizeProject(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
  timestamp: string,
): string {
  const name = text(item.payload, 'name');
  if (name === null) invalidItem(item, 'project name is required');
  const existing = one<{ id: string } & SqlRow>(
    sql,
    'SELECT id FROM projects WHERE workspace_id = ? AND name = ?',
    workspaceId,
    name,
  );
  if (existing !== null) return existing.id;
  const projectId = newId();
  sql.exec(
    'INSERT INTO projects (id, workspace_id, name, description, status, version, created_at, updated_at, archived_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
    projectId,
    workspaceId,
    name,
    text(item.payload, 'description'),
    projectStatus(item.payload),
    sourceTime(item.payload, 'createdAt', timestamp),
    sourceTime(item.payload, 'updatedAt', timestamp),
    text(item.payload, 'archivedAt'),
  );
  for (const sourceTeamId of nestedIds(item.payload, 'teams')) {
    const teamId = requireDestination(
      sql,
      workspaceId,
      batch,
      'team',
      sourceTeamId,
      'project team',
    );
    sql.exec(
      'INSERT OR IGNORE INTO project_teams (workspace_id, project_id, team_id) VALUES (?, ?, ?)',
      workspaceId,
      projectId,
      teamId,
    );
  }
  return projectId;
}

function projectStatus(payload: unknown): string {
  const status = record(payload)?.status;
  return text(status, 'name') ?? text(payload, 'status') ?? 'planned';
}

export function markSourceDestination(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  kind: string,
  sourceId: string,
  destinationId: string,
): void {
  sql.exec(
    'UPDATE source_records SET destination_id = ? WHERE workspace_id = ? AND provider = ? AND source_workspace_id = ? AND kind = ? AND source_id = ? AND destination_id IS NULL',
    destinationId,
    workspaceId,
    batch.provider,
    batch.sourceWorkspaceId,
    kind,
    sourceId,
  );
}

export function normalizeOrganization(
  sql: SqlDb,
  workspaceId: string,
  batch: ImportBatch,
  item: ImportItem,
  timestamp: string,
  actor: AuthActor,
): string | null {
  switch (batch.kind) {
    case 'team':
      return normalizeTeam(sql, workspaceId, item, timestamp, actor);
    case 'state':
      return normalizeState(sql, workspaceId, batch, item, timestamp);
    case 'label':
      return normalizeLabel(sql, workspaceId, item, timestamp);
    case 'project':
      return normalizeProject(sql, workspaceId, batch, item, timestamp);
    default:
      return null;
  }
}

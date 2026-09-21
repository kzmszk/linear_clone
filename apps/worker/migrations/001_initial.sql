PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS installation_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bootstrap_completed INTEGER NOT NULL DEFAULT 0,
  sequence INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO installation_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  access_issuer TEXT NOT NULL,
  access_subject TEXT NOT NULL,
  verified_email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (access_issuer, access_subject)
);

CREATE TABLE IF NOT EXISTS installation_admins (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS workspace_memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  active INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  team_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  accepted_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_key TEXT NOT NULL,
  name TEXT NOT NULL,
  private INTEGER NOT NULL DEFAULT 0,
  next_issue_number INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (workspace_id, team_key)
);

CREATE TABLE IF NOT EXISTS team_memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS project_teams (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, team_id)
);

CREATE TABLE IF NOT EXISTS workflow_states (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  color TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (team_id, name)
);

CREATE TABLE IF NOT EXISTS labels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
  issue_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  state_id TEXT NOT NULL REFERENCES workflow_states(id) ON DELETE RESTRICT,
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 4),
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  parent_id TEXT REFERENCES issues(id) ON DELETE SET NULL,
  estimate REAL,
  due_date TEXT,
  source_assignee_id TEXT,
  source_assignee_name TEXT,
  source_parent_issue_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT,
  completed_at TEXT,
  canceled_at TEXT,
  source_id TEXT,
  UNIQUE (team_id, issue_number)
);

CREATE TABLE IF NOT EXISTS issue_labels (
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (issue_id, label_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  source_author_id TEXT,
  source_parent_comment_id TEXT,
  parent_comment_id TEXT REFERENCES comments(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source INTEGER NOT NULL DEFAULT 0,
  source_id TEXT,
  UNIQUE (workspace_id, source_id)
);

CREATE TABLE IF NOT EXISTS issue_relations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  related_issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL,
  source_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, source_id)
);

CREATE TABLE IF NOT EXISTS issue_attachments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subtitle TEXT,
  url TEXT,
  metadata_json TEXT,
  source TEXT,
  source_type TEXT,
  source_id TEXT,
  file_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (workspace_id, source_id)
);

CREATE TABLE IF NOT EXISTS operations (
  actor_key TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (actor_key, operation_id)
);

CREATE TABLE IF NOT EXISTS changes (
  sequence INTEGER PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  actor_key TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source_workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  applied_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_records (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source_workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source_identity_json TEXT,
  destination_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, provider, source_workspace_id, kind, source_id, source_revision)
);

CREATE INDEX IF NOT EXISTS idx_source_records_run
  ON source_records(workspace_id, provider, source_workspace_id, kind);

CREATE TABLE IF NOT EXISTS source_identities (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source_workspace_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  PRIMARY KEY (workspace_id, provider, source_workspace_id, source_id)
);
CREATE INDEX IF NOT EXISTS idx_import_runs_workspace
  ON import_runs(workspace_id, updated_at, id);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user
  ON workspace_memberships(user_id, active);
CREATE INDEX IF NOT EXISTS idx_team_memberships_user
  ON team_memberships(user_id, team_id);
CREATE INDEX IF NOT EXISTS idx_teams_workspace
  ON teams(workspace_id, archived_at, id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace
  ON projects(workspace_id, archived_at, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_states_team
  ON workflow_states(team_id, position, id);
CREATE INDEX IF NOT EXISTS idx_issues_workspace
  ON issues(workspace_id, deleted_at, archived_at, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_issues_team
  ON issues(team_id, deleted_at, archived_at, updated_at, id);
CREATE INDEX IF NOT EXISTS idx_issues_filters
  ON issues(project_id, assignee_id, state_id);
CREATE INDEX IF NOT EXISTS idx_issue_labels_label
  ON issue_labels(label_id, issue_id);
CREATE INDEX IF NOT EXISTS idx_comments_issue
  ON comments(issue_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_activities_issue
  ON activities(issue_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_issue_relations_issue
  ON issue_relations(issue_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_issue_relations_related
  ON issue_relations(related_issue_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_issue_attachments_issue
  ON issue_attachments(issue_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_changes_workspace
  ON changes(workspace_id, sequence);

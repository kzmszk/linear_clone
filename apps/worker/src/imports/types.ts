export type ImportKind =
  | 'team'
  | 'state'
  | 'label'
  | 'member'
  | 'project'
  | 'issue'
  | 'comment'
  | 'relation'
  | 'history'
  | 'attachment';

export type SourceIdentity = {
  provider: 'linear';
  sourceId: string;
  name: string;
  email: string | null;
};

export type ImportBatch = {
  runId: string;
  provider: 'linear';
  sourceWorkspaceId: string;
  kind: ImportKind;
  items: ImportBatchItem[];
};

export type ImportBatchItem = {
  sourceId: string;
  sourceRevision: string;
  payload: unknown;
  sourceIdentity?: SourceIdentity;
  file?: unknown;
};

export type ImportItem = ImportBatchItem & { payloadHash: string };

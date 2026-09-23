import { useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import type {
  Activity,
  Attachment,
  Comment,
  FileUpload,
  Issue,
  IssueHierarchy as Hierarchy,
  IssuePatch,
  IssueRelation,
  Metadata,
} from '../api.ts';
import { Button } from './ui.tsx';
import { IssueActivity } from './IssueActivity.tsx';
import { IssueAttachments } from './IssueAttachments.tsx';
import { IssueDeleteDialog } from './IssueDeleteDialog.tsx';
import { IssueDescriptionEditor } from './IssueDescriptionEditor.tsx';
import { IssueDetailHeader } from './IssueDetailHeader.tsx';
import { IssueProperties } from './IssueProperties.tsx';
import { IssueRelations } from './IssueRelations.tsx';
import { IssueHierarchy } from './IssueHierarchy.tsx';

type IssueDetailProps = {
  issue: Issue;
  metadata: Metadata;
  comments: Comment[];
  activity: Activity[];
  attachments: Attachment[];
  relations: IssueRelation[];
  hierarchy?: Hierarchy;
  hierarchyLoading: boolean;
  hierarchyError?: string;
  workspaceId: string;
  loading: boolean;
  actionError?: string;
  lifecycleAction?: 'delete' | 'restore';
  onClose: () => void;
  onSavePatch: (
    patch: Omit<IssuePatch, 'expectedVersion'>,
    expectedVersion?: number,
  ) => Promise<void>;
  onDelete: () => void;
  onRestore: () => void;
  onAddComment: (body: string, operationId: string) => Promise<void>;
  onUploadFile: (file: Blob) => Promise<FileUpload>;
  onCopyIdentifier: () => void;
  onSelectIssue: (issueId: string) => void;
  onSetChildParent: (
    child: { id: string; version: number },
    parentId: string | null,
  ) => Promise<void>;
};

export function IssueDetail(props: IssueDetailProps) {
  const {
    issue,
    metadata,
    actionError,
    lifecycleAction,
    onClose,
    onDelete,
    onRestore,
    onCopyIdentifier,
  } = props;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const project = metadata.projects.find((item) => item.id === issue.projectId);
  return (
    <>
      <aside className="detail-pane" aria-label={`Issue ${issue.identifier}`}>
        <IssueDetailHeader
          identifier={issue.identifier}
          projectName={project?.name ?? 'Issue'}
          deleted={Boolean(issue.deletedAt)}
          lifecyclePending={Boolean(lifecycleAction)}
          lifecycleStatus={lifecycleStatus(lifecycleAction)}
          onClose={onClose}
          onDelete={() => setDeleteOpen(true)}
          onRestore={onRestore}
          onCopy={onCopyIdentifier}
        />
        <div className="detail-scroll">
          {actionError ? <ActionError message={actionError} /> : null}
          {issue.deletedAt ? (
            <DeletedBanner
              onRestore={onRestore}
              pending={Boolean(lifecycleAction)}
            />
          ) : null}
          <IssueDetailBody {...props} />
        </div>
      </aside>
      {deleteOpen ? (
        <IssueDeleteDialog
          identifier={issue.identifier}
          onClose={() => setDeleteOpen(false)}
          onConfirm={() => {
            setDeleteOpen(false);
            onDelete();
          }}
        />
      ) : null}
    </>
  );
}

function IssueDetailBody({
  issue,
  metadata,
  comments,
  activity,
  attachments,
  relations,
  hierarchy,
  hierarchyLoading,
  hierarchyError,
  workspaceId,
  loading,
  onSavePatch,
  onAddComment,
  onUploadFile,
  onSelectIssue,
  onSetChildParent,
}: Pick<
  IssueDetailProps,
  | 'issue'
  | 'metadata'
  | 'comments'
  | 'activity'
  | 'attachments'
  | 'relations'
  | 'hierarchy'
  | 'hierarchyLoading'
  | 'hierarchyError'
  | 'workspaceId'
  | 'loading'
  | 'onSavePatch'
  | 'onAddComment'
  | 'onUploadFile'
  | 'onSelectIssue'
  | 'onSetChildParent'
>) {
  return (
    <div className="detail-main">
      <div className="detail-content">
        <IssueDescriptionEditor
          issue={issue}
          onSavePatch={onSavePatch}
          onUploadFile={onUploadFile}
        />
        <IssueAttachments attachments={attachments} />
        {hierarchyError ? (
          <div className="inline-error" role="alert">
            {hierarchyError}
          </div>
        ) : hierarchyLoading && !hierarchy ? (
          <p className="hierarchy-empty">Loading relationships…</p>
        ) : (
          <IssueHierarchy
            issue={issue}
            hierarchy={hierarchy}
            workspaceId={workspaceId}
            onSetParent={(parentId) => onSavePatch({ parentId })}
            onSetChildParent={onSetChildParent}
            onSelectIssue={onSelectIssue}
          />
        )}
        <IssueRelations relations={relations} onSelectIssue={onSelectIssue} />
        <IssueActivity
          comments={comments}
          activity={activity}
          loading={loading}
          onAddComment={onAddComment}
        />
      </div>
      <IssuePropertySidebar
        issue={issue}
        metadata={metadata}
        onSavePatch={onSavePatch}
      />
    </div>
  );
}

function IssuePropertySidebar({
  issue,
  metadata,
  onSavePatch,
}: Pick<IssueDetailProps, 'issue' | 'metadata' | 'onSavePatch'>) {
  const [error, setError] = useState('');
  async function save(patch: Omit<IssuePatch, 'expectedVersion'>) {
    setError('');
    await onSavePatch(patch);
  }
  return (
    <aside className="detail-properties" aria-label="Properties">
      <h3>Properties</h3>
      <IssueProperties
        issue={issue}
        metadata={metadata}
        onSave={save}
        onError={setError}
      />
      {error ? (
        <div className="inline-error" role="alert">
          {error}
        </div>
      ) : null}
    </aside>
  );
}

function lifecycleStatus(action: 'delete' | 'restore' | undefined) {
  if (action === 'delete') return 'Moving to trash…';
  if (action === 'restore') return 'Restoring…';
  return undefined;
}

function DeletedBanner({
  onRestore,
  pending,
}: {
  onRestore: () => void;
  pending: boolean;
}) {
  return (
    <div className="deleted-banner">
      <Trash2 size={15} />
      <span>This issue is in the trash.</span>
      <Button onClick={onRestore} disabled={pending} aria-busy={pending}>
        <RotateCcw size={14} /> Restore
      </Button>
    </div>
  );
}

function ActionError({ message }: { message: string }) {
  return (
    <div className="inline-error detail-action-error" role="alert">
      {message}
    </div>
  );
}

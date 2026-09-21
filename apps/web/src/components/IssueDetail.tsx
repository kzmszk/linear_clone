import { useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import type {
  Activity,
  Attachment,
  Comment,
  FileUpload,
  Issue,
  IssuePatch,
  IssueRelation,
  Metadata,
} from '../api.ts';
import { Button } from './ui.tsx';
import { IssueActivity } from './IssueActivity.tsx';
import { IssueAttachments } from './IssueAttachments.tsx';
import { IssueDescriptionEditor } from './IssueDescriptionEditor.tsx';
import { IssueDetailHeader } from './IssueDetailHeader.tsx';
import { IssueProperties } from './IssueProperties.tsx';
import { IssueRelations } from './IssueRelations.tsx';

type IssueDetailProps = {
  issue: Issue;
  metadata: Metadata;
  comments: Comment[];
  activity: Activity[];
  attachments: Attachment[];
  relations: IssueRelation[];
  loading: boolean;
  actionError?: string;
  onClose: () => void;
  onSavePatch: (
    patch: Omit<IssuePatch, 'expectedVersion'>,
    expectedVersion?: number,
  ) => Promise<void>;
  onDelete: () => void;
  onRestore: () => void;
  onAddComment: (body: string) => Promise<void>;
  onUploadFile: (file: Blob) => Promise<FileUpload>;
  onCopyIdentifier: () => void;
  onSelectIssue: (issueId: string) => void;
};

export function IssueDetail({
  issue,
  metadata,
  comments,
  activity,
  attachments,
  relations,
  loading,
  actionError,
  onClose,
  onSavePatch,
  onDelete,
  onRestore,
  onAddComment,
  onUploadFile,
  onCopyIdentifier,
  onSelectIssue,
}: IssueDetailProps) {
  const project = metadata.projects.find((item) => item.id === issue.projectId);
  return (
    <aside className="detail-pane" aria-label={`Issue ${issue.identifier}`}>
      <IssueDetailHeader
        identifier={issue.identifier}
        projectName={project?.name ?? 'Issue'}
        deleted={Boolean(issue.deletedAt)}
        onClose={onClose}
        onDelete={onDelete}
        onRestore={onRestore}
        onCopy={onCopyIdentifier}
      />
      <div className="detail-scroll">
        {actionError ? <ActionError message={actionError} /> : null}
        {issue.deletedAt ? <DeletedBanner onRestore={onRestore} /> : null}
        <IssueDetailBody
          issue={issue}
          metadata={metadata}
          comments={comments}
          activity={activity}
          attachments={attachments}
          relations={relations}
          loading={loading}
          onSavePatch={onSavePatch}
          onAddComment={onAddComment}
          onUploadFile={onUploadFile}
          onSelectIssue={onSelectIssue}
        />
      </div>
    </aside>
  );
}

function IssueDetailBody({
  issue,
  metadata,
  comments,
  activity,
  attachments,
  relations,
  loading,
  onSavePatch,
  onAddComment,
  onUploadFile,
  onSelectIssue,
}: Pick<
  IssueDetailProps,
  | 'issue'
  | 'metadata'
  | 'comments'
  | 'activity'
  | 'attachments'
  | 'relations'
  | 'loading'
  | 'onSavePatch'
  | 'onAddComment'
  | 'onUploadFile'
  | 'onSelectIssue'
>) {
  const [propertyError, setPropertyError] = useState('');
  async function saveProperty(
    patch: Omit<IssuePatch, 'expectedVersion'>,
  ): Promise<void> {
    setPropertyError('');
    await onSavePatch(patch);
  }
  return (
    <div className="detail-main">
      <IssueDescriptionEditor
        issue={issue}
        onSavePatch={onSavePatch}
        onUploadFile={onUploadFile}
      />
      <IssueAttachments attachments={attachments} />
      <IssueRelations relations={relations} onSelectIssue={onSelectIssue} />
      <IssueProperties
        issue={issue}
        metadata={metadata}
        onSave={saveProperty}
        onError={setPropertyError}
      />
      {propertyError ? (
        <div className="inline-error" role="alert">
          {propertyError}
        </div>
      ) : null}
      <IssueActivity
        comments={comments}
        activity={activity}
        loading={loading}
        onAddComment={onAddComment}
      />
    </div>
  );
}

function DeletedBanner({ onRestore }: { onRestore: () => void }) {
  return (
    <div className="deleted-banner">
      <Trash2 size={15} />
      <span>This issue is in the trash.</span>
      <Button onClick={onRestore}>
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

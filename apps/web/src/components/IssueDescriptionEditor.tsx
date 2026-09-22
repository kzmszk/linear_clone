import { useEffect, useRef, useState } from 'react';
import type { FileUpload, Issue, IssuePatch } from '../api.ts';
import { BodyField, type SaveState } from './IssueEditorFields.tsx';
import { Button, SaveStatus } from './ui.tsx';

type DraftPatch = Omit<IssuePatch, 'expectedVersion'>;
type SavePatch = (patch: DraftPatch, expectedVersion?: number) => Promise<void>;

export function IssueDescriptionEditor({
  issue,
  onSavePatch,
  onUploadFile,
}: {
  issue: Issue;
  onSavePatch: SavePatch;
  onUploadFile: (file: Blob) => Promise<FileUpload>;
}) {
  return (
    <div className="issue-editor">
      <TitleEditor key={issue.id} issue={issue} onSavePatch={onSavePatch} />
      <div className="description-editor">
        <BodyEditor
          key={issue.id}
          issue={issue}
          onSavePatch={onSavePatch}
          onUploadFile={onUploadFile}
        />
      </div>
    </div>
  );
}

function TitleEditor({
  issue,
  onSavePatch,
}: {
  issue: Issue;
  onSavePatch: SavePatch;
}) {
  const [title, setTitle] = useState(issue.title);
  const [dirty, setDirty] = useState(false);
  const [baseVersion, setBaseVersion] = useState<number>();
  const [status, setStatus] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!dirty) setTitle(issue.title);
  }, [dirty, issue.id, issue.title, issue.version]);
  async function save(expectedVersion = baseVersion ?? issue.version) {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    if (nextTitle === issue.title) {
      setDirty(false);
      setBaseVersion(undefined);
      return;
    }
    setStatus('saving');
    setError('');
    try {
      await onSavePatch({ title: nextTitle }, expectedVersion);
      setStatus('saved');
      setDirty(false);
      setBaseVersion(undefined);
    } catch (reason) {
      setStatus('error');
      setError(
        reason instanceof Error ? reason.message : 'Could not save title',
      );
    }
  }
  return (
    <>
      <TitleField
        title={title}
        onChange={(value) => {
          setTitle(value);
          if (value === issue.title) {
            setDirty(false);
            setBaseVersion(undefined);
          } else {
            setDirty(true);
            setBaseVersion((current) => current ?? issue.version);
          }
        }}
        onSave={() => void save()}
      />
      <div className="editor-status">
        <SaveStatus state={status} error={error} />
        {status === 'error' ? (
          <Button onClick={() => void save(issue.version)}>Retry</Button>
        ) : null}
      </div>
    </>
  );
}

function BodyEditor({
  issue,
  onSavePatch,
  onUploadFile,
}: {
  issue: Issue;
  onSavePatch: SavePatch;
  onUploadFile: (file: Blob) => Promise<FileUpload>;
}) {
  const draft = useBodyDraft(issue, onSavePatch, onUploadFile);
  return (
    <BodyField
      issue={issue}
      body={draft.body}
      editing={draft.editing}
      status={draft.status}
      error={draft.error}
      uploading={draft.uploading}
      fileInput={draft.fileInput}
      onBody={draft.setBody}
      onEdit={draft.setEditing}
      onUpload={draft.upload}
      onSave={(expectedVersion) => void draft.save(expectedVersion)}
    />
  );
}

function useBodyDraft(
  issue: Issue,
  onSavePatch: SavePatch,
  onUploadFile: (file: Blob) => Promise<FileUpload>,
) {
  const [body, setBody] = useState(issue.description ?? '');
  const version = useDraftVersion(issue, issue.description ?? '');
  const { dirty, baseVersion } = version;
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<SaveState>('idle');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!dirty) setBody(issue.description ?? '');
  }, [dirty, issue.description, issue.id, issue.version]);
  async function save(expectedVersion = baseVersion ?? issue.version) {
    if (body === (issue.description ?? '')) {
      version.reset();
      setEditing(false);
      return;
    }
    setStatus('saving');
    setError('');
    try {
      await onSavePatch({ description: body || null }, expectedVersion);
      setStatus('saved');
      version.reset();
      setEditing(false);
    } catch (reason) {
      setStatus('error');
      setError(
        reason instanceof Error ? reason.message : 'Could not save description',
      );
    }
  }
  async function upload(file: File) {
    setUploading(true);
    setError('');
    try {
      const uploaded = await onUploadFile(file);
      const markdown = uploaded.contentType.startsWith('image/')
        ? `![${file.name}](${uploaded.url})`
        : `[${file.name}](${uploaded.url})`;
      setBody(
        (current) => `${current}${current.trim() ? '\n\n' : ''}${markdown}`,
      );
      version.markDirty();
      setEditing(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Could not upload attachment',
      );
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }
  return {
    body,
    editing,
    status,
    error,
    uploading,
    fileInput,
    setBody: (value: string) => {
      setBody(value);
      version.setDraft(value);
    },
    setEditing,
    save,
    upload,
  };
}

function useDraftVersion(issue: Issue, source: string) {
  const [dirty, setDirty] = useState(false);
  const [baseVersion, setBaseVersion] = useState<number>();
  function setDraft(value: string) {
    if (value === source) {
      setDirty(false);
      setBaseVersion(undefined);
      return;
    }
    markDirty();
  }
  function markDirty() {
    setDirty(true);
    setBaseVersion((current) => current ?? issue.version);
  }
  function reset() {
    setDirty(false);
    setBaseVersion(undefined);
  }
  return { dirty, baseVersion, setDraft, markDirty, reset };
}

function TitleField({
  title,
  onChange,
  onSave,
}: {
  title: string;
  onChange: (value: string) => void;
  onSave: (expectedVersion?: number) => void;
}) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const textarea = titleRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [title]);
  return (
    <textarea
      ref={titleRef}
      className="issue-title-input"
      aria-label="Issue title"
      rows={1}
      value={title}
      onChange={(event) => onChange(event.target.value)}
      onBlur={() => onSave()}
      onKeyDown={(event) => {
        if (
          !event.nativeEvent.isComposing &&
          event.keyCode !== 229 &&
          event.key === 'Enter' &&
          !event.shiftKey
        ) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

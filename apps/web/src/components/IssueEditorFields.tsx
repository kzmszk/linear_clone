import { Check, Paperclip } from 'lucide-react';
import type { RefObject } from 'react';
import type { Issue } from '../api.ts';
import { Button, SaveStatus } from './ui.tsx';
import { MarkdownBody } from './MarkdownBody.tsx';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function BodyField({
  issue,
  body,
  editing,
  status,
  error,
  uploading,
  fileInput,
  onBody,
  onEdit,
  onUpload,
  onSave,
}: {
  issue: Issue;
  body: string;
  editing: boolean;
  status: SaveState;
  error: string;
  uploading: boolean;
  fileInput: RefObject<HTMLInputElement | null>;
  onBody: (value: string) => void;
  onEdit: (value: boolean) => void;
  onUpload: (file: File) => Promise<void>;
  onSave: (expectedVersion?: number) => void;
}) {
  if (!editing)
    return (
      <button
        className="description-preview"
        onClick={() => onEdit(true)}
        aria-label="Edit issue description"
      >
        <MarkdownBody body={body} />
        <span className="edit-hint">Click to edit</span>
      </button>
    );
  return (
    <>
      <textarea
        className="body-textarea"
        aria-label="Issue description"
        value={body}
        onChange={(event) => onBody(event.target.value)}
        placeholder="Describe the issue…"
        autoFocus
      />
      <BodyActions
        issue={issue}
        status={status}
        error={error}
        uploading={uploading}
        fileInput={fileInput}
        onBody={onBody}
        onEdit={onEdit}
        onUpload={onUpload}
        onSave={onSave}
      />
    </>
  );
}

function BodyActions({
  issue,
  status,
  error,
  uploading,
  fileInput,
  onBody,
  onEdit,
  onUpload,
  onSave,
}: {
  issue: Issue;
  status: SaveState;
  error: string;
  uploading: boolean;
  fileInput: RefObject<HTMLInputElement | null>;
  onBody: (value: string) => void;
  onEdit: (value: boolean) => void;
  onUpload: (file: File) => Promise<void>;
  onSave: (expectedVersion?: number) => void;
}) {
  return (
    <div className="editor-actions">
      <SaveStatus state={status} error={error} />
      <div>
        {status === 'error' ? (
          <Button onClick={() => onSave(issue.version)}>Retry</Button>
        ) : null}
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          aria-label="Attach a file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onUpload(file);
          }}
        />
        <Button
          type="button"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip size={14} /> {uploading ? 'Uploading…' : 'Attach'}
        </Button>
        <Button
          onClick={() => {
            onBody(issue.description ?? '');
            onEdit(false);
          }}
        >
          Cancel
        </Button>
        <Button tone="primary" onClick={() => onSave()}>
          <Check size={14} /> Save description
        </Button>
      </div>
    </div>
  );
}

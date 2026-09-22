import { Plus } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { Metadata } from '../api.ts';
import { CreateIssueFields } from './CreateIssueFields.tsx';
import { Button } from './ui.tsx';
import './create-issue.css';

type CreateIssueFormProps = {
  metadata: Metadata;
  teamId: string;
  title: string;
  description: string;
  stateId: string;
  priority: string;
  assigneeId: string;
  projectId: string;
  teamStates: Metadata['states'];
  submitting: boolean;
  onCreateTeam: () => void;
  onTitle: (value: string) => void;
  onDescription: (value: string) => void;
  onTeam: (value: string) => void;
  onState: (value: string) => void;
  onPriority: (value: string) => void;
  onAssignee: (value: string) => void;
  onProject: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
};

export function CreateIssueForm({
  metadata,
  teamId,
  title,
  description,
  stateId,
  priority,
  assigneeId,
  projectId,
  teamStates,
  submitting,
  onCreateTeam,
  onTitle,
  onDescription,
  onTeam,
  onState,
  onPriority,
  onAssignee,
  onProject,
  onSubmit,
  onClose,
}: CreateIssueFormProps) {
  return (
    <form
      className="create-form create-issue-form"
      onKeyDown={(event) => handleCreateIssueShortcut(event, submitting)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <TitleField title={title} onTitle={onTitle} />
      <DescriptionField
        description={description}
        onDescription={onDescription}
      />
      <CreateIssueFields
        metadata={metadata}
        teamId={teamId}
        stateId={stateId}
        priority={priority}
        assigneeId={assigneeId}
        projectId={projectId}
        teamStates={teamStates}
        onCreateTeam={onCreateTeam}
        onTeam={onTeam}
        onState={onState}
        onPriority={onPriority}
        onAssignee={onAssignee}
        onProject={onProject}
      />
      <CreateFooter
        submitting={submitting}
        valid={Boolean(title.trim() && teamId)}
        onClose={onClose}
      />
    </form>
  );
}

function handleCreateIssueShortcut(
  event: KeyboardEvent<HTMLFormElement>,
  submitting: boolean,
) {
  if (
    (event.metaKey || event.ctrlKey) &&
    event.key === 'Enter' &&
    !event.nativeEvent.isComposing &&
    !submitting
  ) {
    event.preventDefault();
    event.currentTarget.requestSubmit();
  }
}

function TitleField({
  title,
  onTitle,
}: {
  title: string;
  onTitle: (value: string) => void;
}) {
  return (
    <label className="form-field create-issue-title-field">
      <span>
        Title <em aria-hidden="true">Required</em>
      </span>
      <input
        className="create-issue-title"
        aria-label="Title"
        aria-required="true"
        data-dialog-autofocus
        required
        value={title}
        onChange={(event) => onTitle(event.target.value)}
        placeholder="What needs to happen?"
      />
    </label>
  );
}

function DescriptionField({
  description,
  onDescription,
}: {
  description: string;
  onDescription: (value: string) => void;
}) {
  return (
    <label className="form-field create-issue-description-field">
      <span>
        Description <em>Markdown supported</em>
      </span>
      <textarea
        className="create-issue-description"
        value={description}
        onChange={(event) => onDescription(event.target.value)}
        placeholder="Add context, links, and acceptance criteria…"
        rows={3}
      />
    </label>
  );
}

function CreateFooter({
  submitting,
  valid,
  onClose,
}: {
  submitting: boolean;
  valid: boolean;
  onClose: () => void;
}) {
  return (
    <footer className="dialog-footer create-issue-footer">
      <span className="dialog-shortcut">
        Press <kbd>Ctrl/⌘</kbd> <kbd>Enter</kbd> to create
      </span>
      <div>
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" tone="primary" disabled={submitting || !valid}>
          {submitting ? (
            'Creating…'
          ) : (
            <>
              <Plus size={15} /> Create issue
            </>
          )}
        </Button>
      </div>
    </footer>
  );
}

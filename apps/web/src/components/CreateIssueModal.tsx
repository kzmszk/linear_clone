import type { Metadata, NewIssue } from '../api.ts';
import { Dialog, ErrorNotice } from './ui.tsx';
import { CreateIssueForm } from './CreateIssueForm.tsx';
import { useCreateIssueDraft } from './useCreateIssueDraft.ts';
import { useCreateIssueSubmit } from './useCreateIssueSubmit.ts';

export function CreateIssueModal({
  metadata,
  defaultTeamId,
  defaultProjectId,
  onClose,
  onCreateTeam,
  onCreate,
}: {
  metadata: Metadata;
  defaultTeamId?: string;
  defaultProjectId?: string;
  onClose: () => void;
  onCreateTeam: () => void;
  onCreate: (input: NewIssue) => Promise<void>;
}) {
  const draft = useCreateIssueDraft({
    metadata,
    defaultTeamId,
    defaultProjectId,
  });
  const submission = useCreateIssueSubmit({
    ...draft,
    onCreate,
    onClose,
  });
  return (
    <CreateIssueDialog
      {...{
        metadata,
        ...draft,
        submitting: submission.submitting,
        error: submission.error,
        onClose,
        onCreateTeam,
        submit: submission.submit,
      }}
    />
  );
}

function CreateIssueDialog({
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
  error,
  onClose,
  onCreateTeam,
  setTitle,
  setDescription,
  setTeamId,
  setStateId,
  setPriority,
  setAssigneeId,
  setProjectId,
  submit,
}: {
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
  error: string;
  onClose: () => void;
  onCreateTeam: () => void;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setTeamId: (value: string) => void;
  setStateId: (value: string) => void;
  setPriority: (value: string) => void;
  setAssigneeId: (value: string) => void;
  setProjectId: (value: string) => void;
  submit: () => Promise<void>;
}) {
  return (
    <Dialog title="Create issue" onClose={onClose} wide>
      {error ? <ErrorNotice message={error} /> : null}
      <CreateIssueForm
        metadata={metadata}
        teamId={teamId}
        title={title}
        description={description}
        stateId={stateId}
        priority={priority}
        assigneeId={assigneeId}
        projectId={projectId}
        teamStates={teamStates}
        submitting={submitting}
        onCreateTeam={onCreateTeam}
        onTitle={setTitle}
        onDescription={setDescription}
        onTeam={setTeamId}
        onState={setStateId}
        onPriority={setPriority}
        onAssignee={setAssigneeId}
        onProject={setProjectId}
        onSubmit={() => void submit()}
        onClose={onClose}
      />
    </Dialog>
  );
}

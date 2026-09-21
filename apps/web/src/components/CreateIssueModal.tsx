import { useEffect, useMemo, useState } from 'react';
import type { Metadata, NewIssue } from '../api.ts';
import { Dialog, ErrorNotice } from './ui.tsx';
import { CreateIssueForm } from './CreateIssueForm.tsx';
import { useCreateIssueSubmit } from './useCreateIssueSubmit.ts';

export function CreateIssueModal({
  metadata,
  defaultTeamId,
  onClose,
  onCreate,
}: {
  metadata: Metadata;
  defaultTeamId?: string;
  onClose: () => void;
  onCreate: (input: NewIssue) => Promise<void>;
}) {
  const [teamId, setTeamId] = useState(
    defaultTeamId ?? metadata.teams[0]?.id ?? '',
  );
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stateId, setStateId] = useState('');
  const [priority, setPriority] = useState('0');
  const [assigneeId, setAssigneeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const teamStates = useMemo(
    () =>
      metadata.states
        .filter((state) => state.teamId === teamId)
        .sort((a, b) => a.position - b.position),
    [metadata.states, teamId],
  );
  useEffect(() => setStateId(teamStates[0]?.id ?? ''), [teamStates]);
  const submission = useCreateIssueSubmit({
    teamId,
    title,
    description,
    stateId,
    priority,
    assigneeId,
    projectId,
    onCreate,
    onClose,
  });
  return (
    <CreateIssueDialog
      {...{
        metadata,
        teamId,
        title,
        description,
        stateId,
        priority,
        assigneeId,
        projectId,
        teamStates,
        submitting: submission.submitting,
        error: submission.error,
        onClose,
        setTitle,
        setDescription,
        setTeamId,
        setStateId,
        setPriority,
        setAssigneeId,
        setProjectId,
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
    <Dialog
      title="Create issue"
      description="Capture the next piece of work."
      onClose={onClose}
      wide
    >
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

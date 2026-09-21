import { Plus } from 'lucide-react';
import type { Metadata } from '../api.ts';
import { Button } from './ui.tsx';

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
  onTitle,
  onDescription,
  onTeam,
  onState,
  onPriority,
  onAssignee,
  onProject,
  onSubmit,
  onClose,
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
  onTitle: (value: string) => void;
  onDescription: (value: string) => void;
  onTeam: (value: string) => void;
  onState: (value: string) => void;
  onPriority: (value: string) => void;
  onAssignee: (value: string) => void;
  onProject: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <form
      className="create-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <TitleField title={title} onTitle={onTitle} />
      <CreateIssueFields
        metadata={metadata}
        teamId={teamId}
        stateId={stateId}
        priority={priority}
        assigneeId={assigneeId}
        projectId={projectId}
        teamStates={teamStates}
        onTeam={onTeam}
        onState={onState}
        onPriority={onPriority}
        onAssignee={onAssignee}
        onProject={onProject}
      />
      <DescriptionField
        description={description}
        onDescription={onDescription}
      />
      <CreateFooter
        submitting={submitting}
        valid={Boolean(title.trim() && teamId)}
        onClose={onClose}
      />
    </form>
  );
}

function CreateIssueFields({
  metadata,
  teamId,
  stateId,
  priority,
  assigneeId,
  projectId,
  teamStates,
  onTeam,
  onState,
  onPriority,
  onAssignee,
  onProject,
}: {
  metadata: Metadata;
  teamId: string;
  stateId: string;
  priority: string;
  assigneeId: string;
  projectId: string;
  teamStates: Metadata['states'];
  onTeam: (value: string) => void;
  onState: (value: string) => void;
  onPriority: (value: string) => void;
  onAssignee: (value: string) => void;
  onProject: (value: string) => void;
}) {
  return (
    <div className="form-grid">
      <TeamField metadata={metadata} teamId={teamId} onTeam={onTeam} />
      <StatusField
        teamStates={teamStates}
        stateId={stateId}
        onState={onState}
      />
      <PriorityField priority={priority} onPriority={onPriority} />
      <AssigneeField
        metadata={metadata}
        assigneeId={assigneeId}
        onAssignee={onAssignee}
      />
      <ProjectField
        metadata={metadata}
        teamId={teamId}
        projectId={projectId}
        onProject={onProject}
      />
    </div>
  );
}

function TitleField({
  title,
  onTitle,
}: {
  title: string;
  onTitle: (value: string) => void;
}) {
  return (
    <label className="form-field">
      <span>Title</span>
      <input
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
    <label className="form-field">
      <span>
        Description <em>Markdown supported</em>
      </span>
      <textarea
        value={description}
        onChange={(event) => onDescription(event.target.value)}
        placeholder="Add context, links, and acceptance criteria…"
        rows={7}
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
    <footer className="dialog-footer">
      <span className="dialog-shortcut">
        Press <kbd>⌘</kbd>
        <kbd>↵</kbd> to create
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

function TeamField({
  metadata,
  teamId,
  onTeam,
}: {
  metadata: Metadata;
  teamId: string;
  onTeam: (value: string) => void;
}) {
  return (
    <label className="form-field">
      <span>Team</span>
      <select
        required
        value={teamId}
        onChange={(event) => onTeam(event.target.value)}
      >
        {metadata.teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name} · {team.key}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusField({
  teamStates,
  stateId,
  onState,
}: {
  teamStates: Metadata['states'];
  stateId: string;
  onState: (value: string) => void;
}) {
  return (
    <label className="form-field">
      <span>Status</span>
      <select value={stateId} onChange={(event) => onState(event.target.value)}>
        <option value="">No status</option>
        {teamStates.map((state) => (
          <option key={state.id} value={state.id}>
            {state.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function PriorityField({
  priority,
  onPriority,
}: {
  priority: string;
  onPriority: (value: string) => void;
}) {
  return (
    <label className="form-field">
      <span>Priority</span>
      <select
        value={priority}
        onChange={(event) => onPriority(event.target.value)}
      >
        <option value="0">No priority</option>
        <option value="1">Urgent</option>
        <option value="2">High</option>
        <option value="3">Medium</option>
        <option value="4">Low</option>
      </select>
    </label>
  );
}

function AssigneeField({
  metadata,
  assigneeId,
  onAssignee,
}: {
  metadata: Metadata;
  assigneeId: string;
  onAssignee: (value: string) => void;
}) {
  return (
    <label className="form-field">
      <span>Assignee</span>
      <select
        value={assigneeId}
        onChange={(event) => onAssignee(event.target.value)}
      >
        <option value="">Unassigned</option>
        {metadata.members
          .filter((member) => member.active && member.userId)
          .map((member) => (
            <option key={member.id} value={member.userId ?? ''}>
              {member.name || member.email}
            </option>
          ))}
      </select>
    </label>
  );
}

function ProjectField({
  metadata,
  teamId,
  projectId,
  onProject,
}: {
  metadata: Metadata;
  teamId: string;
  projectId: string;
  onProject: (value: string) => void;
}) {
  return (
    <label className="form-field">
      <span>Project</span>
      <select
        value={projectId}
        onChange={(event) => onProject(event.target.value)}
      >
        <option value="">No project</option>
        {metadata.projects
          .filter((project) => project.teamIds.includes(teamId))
          .map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
      </select>
    </label>
  );
}

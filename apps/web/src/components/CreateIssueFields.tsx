import { Archive } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Metadata } from '../api.ts';
import {
  PropertySelect,
  type PropertySelectOption,
} from './PropertySelect.tsx';
import { Avatar, Button, PriorityIcon, StatusIcon } from './ui.tsx';

export function CreateIssueFields({
  metadata,
  teamId,
  stateId,
  priority,
  assigneeId,
  projectId,
  teamStates,
  onCreateTeam,
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
  onCreateTeam: () => void;
  onTeam: (value: string) => void;
  onState: (value: string) => void;
  onPriority: (value: string) => void;
  onAssignee: (value: string) => void;
  onProject: (value: string) => void;
}) {
  return (
    <div className="create-issue-properties">
      <TeamField
        metadata={metadata}
        teamId={teamId}
        onTeam={onTeam}
        onCreateTeam={onCreateTeam}
      />
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

function TeamField({
  metadata,
  teamId,
  onTeam,
  onCreateTeam,
}: {
  metadata: Metadata;
  teamId: string;
  onTeam: (value: string) => void;
  onCreateTeam: () => void;
}) {
  const empty = metadata.teams.length === 0;
  const options = empty
    ? [{ value: '', label: 'No teams available' }]
    : metadata.teams.map((team) => ({
        value: team.id,
        label: `${team.name} · ${team.key}`,
      }));
  return (
    <div className="form-field create-issue-property create-issue-team-field">
      <span>
        Team <em aria-hidden="true">Required</em>
      </span>
      <PropertySelect
        label="Team"
        value={teamId}
        options={options}
        onChange={onTeam}
        disabled={empty}
        required
      />
      {empty ? (
        <p
          id="create-issue-team-help"
          className="form-help create-issue-team-help"
        >
          Create a team before creating an issue.{' '}
          <Button type="button" onClick={onCreateTeam}>
            Create a team
          </Button>
        </p>
      ) : null}
    </div>
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
  const options: PropertySelectOption[] = [
    { value: '', label: 'No status' },
    ...teamStates.map((state) => ({
      value: state.id,
      label: state.name,
      icon: <StatusIcon type={state.type} color={state.color} />,
    })),
  ];
  return (
    <PropertyField label="Status">
      <PropertySelect
        label="Status"
        value={stateId}
        options={options}
        onChange={onState}
      />
    </PropertyField>
  );
}

function PriorityField({
  priority,
  onPriority,
}: {
  priority: string;
  onPriority: (value: string) => void;
}) {
  const priorities: Array<[number, string]> = [
    [0, 'No priority'],
    [1, 'Urgent'],
    [2, 'High'],
    [3, 'Medium'],
    [4, 'Low'],
  ];
  const options: PropertySelectOption[] = priorities.map(([value, label]) => ({
    value: String(value),
    label,
    icon: <PriorityIcon priority={value} />,
  }));
  return (
    <PropertyField label="Priority">
      <PropertySelect
        label="Priority"
        value={priority}
        options={options}
        onChange={onPriority}
      />
    </PropertyField>
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
  const options: PropertySelectOption[] = [
    { value: '', label: 'Unassigned', icon: <Avatar /> },
    ...metadata.members
      .filter((member) => member.active && member.userId)
      .map((member) => ({
        value: member.userId ?? '',
        label: member.name || member.email,
        icon: <Avatar name={member.name} email={member.email} />,
      })),
  ];
  return (
    <PropertyField label="Assignee">
      <PropertySelect
        label="Assignee"
        value={assigneeId}
        options={options}
        onChange={onAssignee}
      />
    </PropertyField>
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
  const options: PropertySelectOption[] = [
    { value: '', label: 'No project', icon: <Archive size={14} /> },
    ...metadata.projects
      .filter(
        (project) => !project.archivedAt && project.teamIds.includes(teamId),
      )
      .map((project) => ({
        value: project.id,
        label: project.name,
        icon: <Archive size={14} />,
      })),
  ];
  return (
    <PropertyField label="Project">
      <PropertySelect
        label="Project"
        value={projectId}
        options={options}
        onChange={onProject}
      />
    </PropertyField>
  );
}

function PropertyField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="form-field create-issue-property">
      <span>{label}</span>
      {children}
    </div>
  );
}

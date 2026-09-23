import { useMemo } from 'react';
import { Archive, CalendarDays } from 'lucide-react';
import type { Issue, IssuePatch, Metadata } from '../api.ts';
import { Avatar, PriorityIcon, StatusIcon } from './ui.tsx';
import { PropertySelect } from './PropertySelect.tsx';
import { IssueLabels } from './IssueLabels.tsx';

type SaveProperty = (
  patch: Omit<IssuePatch, 'expectedVersion'>,
) => Promise<void>;

export function IssueProperties({
  issue,
  metadata,
  onSave,
  onError,
}: {
  issue: Issue;
  metadata: Metadata;
  onSave: SaveProperty;
  onError: (message: string) => void;
}) {
  const teamStates = useMemo(
    () =>
      metadata.states
        .filter((item) => item.teamId === issue.teamId)
        .sort((a, b) => a.position - b.position),
    [metadata.states, issue.teamId],
  );
  async function save(patch: Omit<IssuePatch, 'expectedVersion'>) {
    try {
      await onSave(patch);
    } catch (error) {
      onError(
        error instanceof Error ? error.message : 'Could not save property',
      );
    }
  }
  return (
    <div className="property-grid">
      <EditableProperties
        issue={issue}
        metadata={metadata}
        teamStates={teamStates}
        onSave={save}
      />
      <IssueLabels
        issue={issue}
        labels={metadata.labels}
        onSave={(labelIds) => save({ labelIds })}
      />
      <ReadonlyProperties issue={issue} />
    </div>
  );
}

function EditableProperties({
  issue,
  metadata,
  teamStates,
  onSave,
}: {
  issue: Issue;
  metadata: Metadata;
  teamStates: Metadata['states'];
  onSave: SaveProperty;
}) {
  return (
    <>
      <StatusField issue={issue} teamStates={teamStates} onSave={onSave} />
      <PriorityField issue={issue} onSave={onSave} />
      <AssigneeField issue={issue} metadata={metadata} onSave={onSave} />
      <ProjectField issue={issue} metadata={metadata} onSave={onSave} />
    </>
  );
}

function StatusField({
  issue,
  teamStates,
  onSave,
}: {
  issue: Issue;
  teamStates: Metadata['states'];
  onSave: SaveProperty;
}) {
  return (
    <label className="property-field">
      <span>Status</span>
      <div className="select-with-icon">
        <PropertySelect
          label="Status"
          value={issue.stateId}
          options={teamStates.map((item) => ({
            value: item.id,
            label: item.name,
            icon: <StatusIcon type={item.type} color={item.color} />,
          }))}
          onChange={(stateId) => void onSave({ stateId })}
        />
      </div>
    </label>
  );
}

function PriorityField({
  issue,
  onSave,
}: {
  issue: Issue;
  onSave: SaveProperty;
}) {
  const options: Array<[number, string]> = [
    [0, 'No priority'],
    [1, 'Urgent'],
    [2, 'High'],
    [3, 'Medium'],
    [4, 'Low'],
  ];
  return (
    <label className="property-field">
      <span>Priority</span>
      <div className="select-with-icon">
        <PropertySelect
          label="Priority"
          value={String(issue.priority)}
          options={options.map(([priority, label]) => ({
            value: String(priority),
            label,
            icon: <PriorityIcon priority={priority} />,
          }))}
          onChange={(value) => void onSave({ priority: Number(value) })}
        />
      </div>
    </label>
  );
}

function AssigneeField({
  issue,
  metadata,
  onSave,
}: {
  issue: Issue;
  metadata: Metadata;
  onSave: SaveProperty;
}) {
  const importedValue = '__imported_assignee__';
  const selectedValue =
    issue.assigneeId ?? (issue.assigneeName ? importedValue : '');
  const options = [
    ...(issue.assigneeName
      ? [
          {
            value: importedValue,
            label: `Imported: ${issue.assigneeName}`,
            icon: <Avatar name={issue.assigneeName} />,
          },
        ]
      : []),
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
    <label className="property-field">
      <span>Assignee</span>
      <div className="select-with-icon">
        <PropertySelect
          label="Assignee"
          value={selectedValue}
          options={options}
          onChange={(value) =>
            void onSave({
              assigneeId: value === importedValue ? null : value || null,
            })
          }
        />
      </div>
    </label>
  );
}

function ProjectField({
  issue,
  metadata,
  onSave,
}: {
  issue: Issue;
  metadata: Metadata;
  onSave: SaveProperty;
}) {
  return (
    <label className="property-field">
      <span>Project</span>
      <div className="select-with-icon">
        <PropertySelect
          label="Project"
          value={issue.projectId ?? ''}
          options={[
            { value: '', label: 'No project', icon: <Archive size={15} /> },
            ...metadata.projects
              .filter(
                (item) =>
                  item.id === issue.projectId ||
                  item.teamIds.includes(issue.teamId),
              )
              .map((item) => ({
                value: item.id,
                label: item.name,
                icon: <Archive size={15} />,
              })),
          ]}
          onChange={(value) => void onSave({ projectId: value || null })}
        />
      </div>
    </label>
  );
}

function ReadonlyProperties({ issue }: { issue: Issue }) {
  return (
    <>
      <div className="property-field property-readonly">
        <span>Created</span>
        <span>
          <CalendarDays size={14} /> {formatDate(issue.createdAt, true)}
        </span>
      </div>
      <div className="property-field property-readonly">
        <span>Updated</span>
        <span>{formatDate(issue.updatedAt, false)}</span>
      </div>
    </>
  );
}

function formatDate(value: string, year: boolean): string {
  return new Date(value).toLocaleDateString(
    undefined,
    year
      ? { month: 'short', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric' },
  );
}

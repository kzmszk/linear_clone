import { useMemo } from 'react';
import { Archive, CalendarDays } from 'lucide-react';
import type { Issue, IssuePatch, Metadata } from '../api.ts';
import { Avatar, PriorityIcon, StatusIcon } from './ui.tsx';

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
  const state = metadata.states.find((item) => item.id === issue.stateId);
  const assignee = metadata.members.find(
    (item) => item.userId === issue.assigneeId,
  );
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
        state={state}
        assignee={assignee}
        teamStates={teamStates}
        onSave={save}
      />
      <ReadonlyProperties issue={issue} />
    </div>
  );
}

function EditableProperties({
  issue,
  metadata,
  state,
  assignee,
  teamStates,
  onSave,
}: {
  issue: Issue;
  metadata: Metadata;
  state: Metadata['states'][number] | undefined;
  assignee: Metadata['members'][number] | undefined;
  teamStates: Metadata['states'];
  onSave: SaveProperty;
}) {
  return (
    <>
      <StatusField
        issue={issue}
        state={state}
        teamStates={teamStates}
        onSave={onSave}
      />
      <PriorityField issue={issue} onSave={onSave} />
      <AssigneeField
        issue={issue}
        assignee={assignee}
        metadata={metadata}
        onSave={onSave}
      />
      <ProjectField issue={issue} metadata={metadata} onSave={onSave} />
    </>
  );
}

function StatusField({
  issue,
  state,
  teamStates,
  onSave,
}: {
  issue: Issue;
  state: Metadata['states'][number] | undefined;
  teamStates: Metadata['states'];
  onSave: SaveProperty;
}) {
  return (
    <label className="property-field">
      <span>Status</span>
      <div className="select-with-icon">
        <StatusIcon type={state?.type ?? 'unstarted'} color={state?.color} />
        <select
          aria-label="Status"
          value={issue.stateId}
          onChange={(event) => void onSave({ stateId: event.target.value })}
        >
          {teamStates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
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
  return (
    <label className="property-field">
      <span>Priority</span>
      <div className="select-with-icon">
        <PriorityIcon priority={issue.priority} />
        <select
          aria-label="Priority"
          value={String(issue.priority)}
          onChange={(event) =>
            void onSave({ priority: Number(event.target.value) })
          }
        >
          <option value="0">No priority</option>
          <option value="1">Urgent</option>
          <option value="2">High</option>
          <option value="3">Medium</option>
          <option value="4">Low</option>
        </select>
      </div>
    </label>
  );
}

function AssigneeField({
  issue,
  assignee,
  metadata,
  onSave,
}: {
  issue: Issue;
  assignee: Metadata['members'][number] | undefined;
  metadata: Metadata;
  onSave: SaveProperty;
}) {
  const importedValue = '__imported_assignee__';
  const selectedValue =
    issue.assigneeId ?? (issue.assigneeName ? importedValue : '');
  return (
    <label className="property-field">
      <span>Assignee</span>
      <div className="select-with-icon">
        <Avatar
          name={assignee?.name ?? issue.assigneeName}
          email={assignee?.email}
        />
        <select
          aria-label="Assignee"
          value={selectedValue}
          onChange={(event) =>
            void onSave({
              assigneeId:
                event.target.value === importedValue
                  ? null
                  : event.target.value || null,
            })
          }
        >
          {issue.assigneeName && !issue.assigneeId ? (
            <option value={importedValue} disabled>
              Imported: {issue.assigneeName}
            </option>
          ) : null}
          <option value="">Unassigned</option>
          {metadata.members
            .filter((member) => member.active && member.userId)
            .map((member) => (
              <option value={member.userId ?? ''} key={member.id}>
                {member.name || member.email}
              </option>
            ))}
        </select>
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
        <Archive size={15} />
        <select
          aria-label="Project"
          value={issue.projectId ?? ''}
          onChange={(event) =>
            void onSave({ projectId: event.target.value || null })
          }
        >
          <option value="">No project</option>
          {metadata.projects
            .filter(
              (item) =>
                item.id === issue.projectId ||
                item.teamIds.includes(issue.teamId),
            )
            .map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
        </select>
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

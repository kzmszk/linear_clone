import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Project, Team } from '../../api.ts';
import { Button, IconButton } from '../ui.tsx';
import { CreateResourceDialog } from './CreateResourceDialog.tsx';
import type { EditTarget } from './types.ts';
import { TeamMultiSelect } from './TeamMultiSelect.tsx';

export function ProjectPanel({
  projects,
  teams,
  name,
  description,
  status,
  teamIds,
  formError,
  onName,
  onDescription,
  onStatus,
  onTeamIds,
  submitting,
  onSubmit,
  onReset,
  onEdit,
}: {
  projects: Project[];
  teams: Team[];
  name: string;
  description: string;
  status: string;
  teamIds: string[];
  formError: string;
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onStatus: (value: string) => void;
  onTeamIds: (value: string[]) => void;
  submitting: boolean;
  onSubmit: () => Promise<boolean>;
  onReset: () => void;
  onEdit: (target: EditTarget) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  function openCreate() {
    onReset();
    setCreateOpen(true);
  }
  function closeCreate() {
    setCreateOpen(false);
    onReset();
  }
  async function submitCreate() {
    if (await onSubmit()) setCreateOpen(false);
  }
  return (
    <div className="settings-section">
      <ProjectHeader onCreate={openCreate} />
      <ProjectRows projects={projects} teams={teams} onEdit={onEdit} />
      <CreateResourceDialog
        open={createOpen}
        title="Create project"
        description="Group work across one or more teams."
        error={formError}
        submitting={submitting}
        valid={Boolean(name.trim() && teamIds.length > 0)}
        submitLabel="Create project"
        onClose={closeCreate}
        onSubmit={() => void submitCreate()}
      >
        <ProjectCreateFields
          teams={teams}
          name={name}
          description={description}
          status={status}
          teamIds={teamIds}
          onName={onName}
          onDescription={onDescription}
          onStatus={onStatus}
          onTeamIds={onTeamIds}
        />
      </CreateResourceDialog>
    </div>
  );
}

function ProjectCreateFields({
  teams,
  name,
  description,
  status,
  teamIds,
  onName,
  onDescription,
  onStatus,
  onTeamIds,
}: {
  teams: Team[];
  name: string;
  description: string;
  status: string;
  teamIds: string[];
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onStatus: (value: string) => void;
  onTeamIds: (value: string[]) => void;
}) {
  return (
    <>
      <label className="form-field">
        <span>
          Project name <em aria-hidden="true">Required</em>
        </span>
        <input
          aria-label="Project name"
          required
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder="Website redesign"
        />
      </label>
      <label className="form-field">
        <span>Description</span>
        <textarea
          aria-label="Project description"
          value={description}
          onChange={(event) => onDescription(event.target.value)}
          placeholder="What outcome are we driving?"
          rows={3}
        />
      </label>
      <TeamMultiSelect
        teams={teams}
        value={teamIds}
        onChange={onTeamIds}
        required
      />
      <label className="form-field">
        <span>Status</span>
        <select
          aria-label="Project status"
          value={status}
          onChange={(event) => onStatus(event.target.value)}
        >
          <option value="planned">Planned</option>
          <option value="started">Started</option>
          <option value="completed">Completed</option>
        </select>
      </label>
    </>
  );
}

function ProjectHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="settings-section-heading">
      <div>
        <p>Projects group work across one or more teams.</p>
      </div>
      <Button tone="primary" onClick={onCreate}>
        <Plus size={15} /> New project
      </Button>
    </div>
  );
}

function ProjectRows({
  projects,
  teams,
  onEdit,
}: {
  projects: Project[];
  teams: Team[];
  onEdit: (target: EditTarget) => void;
}) {
  return (
    <div className="settings-table">
      {projects.map((item) => (
        <div className="settings-row" key={item.id}>
          <div className="project-glyph large" />
          <div>
            <strong>{item.name}</strong>
            <span>
              {item.status} ·{' '}
              {item.teamIds.length
                ? item.teamIds
                    .map((id) => teams.find((team) => team.id === id)?.key)
                    .filter(Boolean)
                    .join(', ')
                : 'No teams'}
            </span>
          </div>
          <span className="row-spacer" />
          <IconButton
            label={`Edit ${item.name}`}
            onClick={() => onEdit({ kind: 'project', item })}
          >
            <Pencil size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

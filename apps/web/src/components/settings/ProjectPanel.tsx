import { Pencil, Plus } from 'lucide-react';
import type { Project, Team } from '../../api.ts';
import { Button, IconButton } from '../ui.tsx';
import type { EditTarget } from './types.ts';
import { TeamMultiSelect } from './TeamMultiSelect.tsx';

export function ProjectPanel({
  projects,
  teams,
  name,
  description,
  status,
  teamIds,
  onName,
  onDescription,
  onStatus,
  onTeamIds,
  submitting,
  onSubmit,
  onEdit,
}: {
  projects: Project[];
  teams: Team[];
  name: string;
  description: string;
  status: string;
  teamIds: string[];
  onName: (value: string) => void;
  onDescription: (value: string) => void;
  onStatus: (value: string) => void;
  onTeamIds: (value: string[]) => void;
  submitting: boolean;
  onSubmit: () => void;
  onEdit: (target: EditTarget) => void;
}) {
  return (
    <div className="settings-section">
      <ProjectHeader />
      <ProjectRows projects={projects} teams={teams} onEdit={onEdit} />
      <div className="inline-create">
        <h3>Add project</h3>
        <input
          aria-label="Project name"
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder="Website redesign"
        />
        <textarea
          aria-label="Project description"
          value={description}
          onChange={(event) => onDescription(event.target.value)}
          placeholder="What outcome are we driving?"
          rows={3}
        />
        <TeamMultiSelect teams={teams} value={teamIds} onChange={onTeamIds} />
        <div className="form-grid">
          <select
            aria-label="Project status"
            value={status}
            onChange={(event) => onStatus(event.target.value)}
          >
            <option value="planned">Planned</option>
            <option value="started">Started</option>
            <option value="completed">Completed</option>
          </select>
          <Button
            tone="primary"
            disabled={submitting || !name.trim() || teamIds.length === 0}
            onClick={onSubmit}
          >
            <Plus size={15} /> Add project
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProjectHeader() {
  return (
    <div className="settings-section-heading">
      <div>
        <h2>Projects</h2>
        <p>Projects group work across one or more teams.</p>
      </div>
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

import { Pencil, Plus } from 'lucide-react';
import type { Team } from '../../api.ts';
import { Button, IconButton } from '../ui.tsx';
import type { EditTarget } from './types.ts';

export function TeamPanel({
  teams,
  name,
  teamKey,
  privateTeam,
  onName,
  onKey,
  onPrivate,
  submitting,
  onSubmit,
  onEdit,
}: {
  teams: Team[];
  name: string;
  teamKey: string;
  privateTeam: boolean;
  onName: (value: string) => void;
  onKey: (value: string) => void;
  onPrivate: (value: boolean) => void;
  submitting: boolean;
  onSubmit: () => void;
  onEdit: (target: EditTarget) => void;
}) {
  return (
    <div className="settings-section">
      <TeamHeader />
      <TeamRows teams={teams} onEdit={onEdit} />
      <TeamCreateForm
        name={name}
        teamKey={teamKey}
        privateTeam={privateTeam}
        onName={onName}
        onKey={onKey}
        onPrivate={onPrivate}
        submitting={submitting}
        onSubmit={onSubmit}
      />
    </div>
  );
}

function TeamHeader() {
  return (
    <div className="settings-section-heading">
      <div>
        <h2>Teams</h2>
        <p>Teams own issue workflows and identifiers.</p>
      </div>
    </div>
  );
}

function TeamRows({
  teams,
  onEdit,
}: {
  teams: Team[];
  onEdit: (target: EditTarget) => void;
}) {
  return (
    <div className="settings-table">
      {teams.map((item) => (
        <div className="settings-row" key={item.id}>
          <div
            className="team-dot large"
            style={{ background: item.private ? '#f59e0b' : '#8b80f9' }}
          />
          <div>
            <strong>{item.name}</strong>
            <span>
              {item.key}
              {item.private ? ' · Private' : ''}
            </span>
          </div>
          <span className="row-spacer" />
          <IconButton
            label={`Edit ${item.name}`}
            onClick={() => onEdit({ kind: 'team', item })}
          >
            <Pencil size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

function TeamCreateForm({
  name,
  teamKey,
  privateTeam,
  onName,
  onKey,
  onPrivate,
  submitting,
  onSubmit,
}: {
  name: string;
  teamKey: string;
  privateTeam: boolean;
  onName: (value: string) => void;
  onKey: (value: string) => void;
  onPrivate: (value: boolean) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="inline-create">
      <h3>Add team</h3>
      <div className="form-grid">
        <input
          aria-label="Team name"
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder="Engineering"
        />
        <input
          aria-label="Team key"
          value={teamKey}
          onChange={(event) => onKey(event.target.value)}
          placeholder="ENG"
          maxLength={10}
        />
      </div>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={privateTeam}
          onChange={(event) => onPrivate(event.target.checked)}
        />{' '}
        Private team
      </label>
      <Button
        tone="primary"
        disabled={submitting || !name.trim() || !teamKey.trim()}
        onClick={onSubmit}
      >
        <Plus size={15} /> Add team
      </Button>
    </div>
  );
}

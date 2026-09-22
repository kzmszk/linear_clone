import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Team } from '../../api.ts';
import { Button, IconButton } from '../ui.tsx';
import { CreateResourceDialog } from './CreateResourceDialog.tsx';
import type { EditTarget } from './types.ts';

export function TeamPanel({
  teams,
  name,
  teamKey,
  privateTeam,
  formError,
  onName,
  onKey,
  onPrivate,
  submitting,
  onSubmit,
  onReset,
  onEdit,
}: {
  teams: Team[];
  name: string;
  teamKey: string;
  privateTeam: boolean;
  formError: string;
  onName: (value: string) => void;
  onKey: (value: string) => void;
  onPrivate: (value: boolean) => void;
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
      <TeamHeader onCreate={openCreate} />
      <TeamRows teams={teams} onEdit={onEdit} />
      <CreateResourceDialog
        open={createOpen}
        title="Create team"
        description="Set the identifier used by new issues."
        error={formError}
        submitting={submitting}
        valid={Boolean(name.trim() && teamKey.trim())}
        submitLabel="Create team"
        onClose={closeCreate}
        onSubmit={() => void submitCreate()}
      >
        <TeamCreateFields
          name={name}
          teamKey={teamKey}
          privateTeam={privateTeam}
          onName={onName}
          onKey={onKey}
          onPrivate={onPrivate}
        />
      </CreateResourceDialog>
    </div>
  );
}

function TeamHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="settings-section-heading">
      <div>
        <p>Teams own issue workflows and identifiers.</p>
      </div>
      <Button tone="primary" onClick={onCreate}>
        <Plus size={15} /> New team
      </Button>
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

function TeamCreateFields({
  name,
  teamKey,
  privateTeam,
  onName,
  onKey,
  onPrivate,
}: {
  name: string;
  teamKey: string;
  privateTeam: boolean;
  onName: (value: string) => void;
  onKey: (value: string) => void;
  onPrivate: (value: boolean) => void;
}) {
  return (
    <>
      <div className="form-grid">
        <label className="form-field">
          <span>
            Team name <em aria-hidden="true">Required</em>
          </span>
          <input
            aria-label="Team name"
            required
            value={name}
            onChange={(event) => onName(event.target.value)}
            placeholder="Engineering"
          />
        </label>
        <label className="form-field">
          <span>
            Team key <em aria-hidden="true">Required</em>
          </span>
          <input
            aria-label="Team key"
            required
            pattern="[A-Z][A-Z0-9]{0,9}"
            value={teamKey}
            onChange={(event) => onKey(event.target.value)}
            placeholder="ENG"
            maxLength={10}
          />
        </label>
      </div>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={privateTeam}
          onChange={(event) => onPrivate(event.target.checked)}
        />{' '}
        Private team
      </label>
    </>
  );
}

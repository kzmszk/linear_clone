import type { Team, WorkflowState } from '../../api.ts';
import { Button, Dialog, ErrorNotice } from '../ui.tsx';

const stateTypes = [
  'triage',
  'backlog',
  'unstarted',
  'started',
  'completed',
  'canceled',
] as const;
export type StateType = (typeof stateTypes)[number];
export type StateDraft = {
  item?: WorkflowState;
  teamId: string;
  name: string;
  type: string;
  color: string;
  position: number;
};

export function StateDialog({
  draft,
  teams,
  error,
  submitting,
  onChange,
  onClose,
  onSubmit,
}: {
  draft: StateDraft;
  teams: Team[];
  error: string;
  submitting: boolean;
  onChange: (draft: StateDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const editing = Boolean(draft.item);
  return (
    <Dialog
      title={editing ? 'Edit status' : 'Create status'}
      onClose={onClose}
      dismissible={!submitting}
    >
      {error ? <ErrorNotice message={error} /> : null}
      <form
        className="create-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <fieldset className="classification-fields" disabled={submitting}>
          <StateFields
            draft={draft}
            teams={teams}
            editing={editing}
            onChange={onChange}
          />
        </fieldset>
        <footer className="dialog-footer">
          <Button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            tone="primary"
            disabled={submitting || !draft.name.trim()}
          >
            {submitLabel(editing, submitting)}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

function StateFields({
  draft,
  teams,
  editing,
  onChange,
}: {
  draft: StateDraft;
  teams: Team[];
  editing: boolean;
  onChange: (draft: StateDraft) => void;
}) {
  return (
    <>
      <label className="form-field">
        <span>Status name</span>
        <input
          aria-label="Status name"
          data-dialog-autofocus
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </label>
      <label className="form-field">
        <span>Team</span>
        <select
          aria-label="Status team"
          value={draft.teamId}
          disabled={editing}
          onChange={(event) =>
            onChange({ ...draft, teamId: event.target.value, position: 0 })
          }
        >
          {teams.map((team) => (
            <option value={team.id} key={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>
      <TypeField draft={draft} onChange={onChange} />
      <VisualFields draft={draft} onChange={onChange} />
    </>
  );
}

function TypeField({
  draft,
  onChange,
}: {
  draft: StateDraft;
  onChange: (draft: StateDraft) => void;
}) {
  const unknownType = editableStateType(draft.type) === undefined;
  return (
    <label className="form-field">
      <span>Type</span>
      <select
        aria-label="Status type"
        value={draft.type}
        onChange={(event) => onChange({ ...draft, type: event.target.value })}
      >
        {unknownType ? <option value={draft.type}>{draft.type}</option> : null}
        {stateTypes.map((type) => (
          <option value={type} key={type}>
            {type}
          </option>
        ))}
      </select>
    </label>
  );
}

function VisualFields({
  draft,
  onChange,
}: {
  draft: StateDraft;
  onChange: (draft: StateDraft) => void;
}) {
  return (
    <div className="form-grid">
      <label className="form-field">
        <span>Color</span>
        <input
          aria-label="Status color"
          type="color"
          value={draft.color}
          onChange={(event) =>
            onChange({ ...draft, color: event.target.value })
          }
        />
      </label>
      <label className="form-field">
        <span>Position</span>
        <input
          aria-label="Status position"
          type="number"
          value={draft.position}
          onChange={(event) =>
            onChange({ ...draft, position: event.target.valueAsNumber })
          }
        />
      </label>
    </div>
  );
}

export function editableStateType(value: string): StateType | undefined {
  return stateTypes.find((type) => type === value);
}

function submitLabel(editing: boolean, submitting: boolean): string {
  if (submitting) return 'Saving…';
  return editing ? 'Save changes' : 'Create status';
}

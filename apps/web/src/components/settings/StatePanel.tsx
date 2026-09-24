import { Archive, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Team, WorkflowState } from '../../api.ts';
import { Button, IconButton, StatusIcon } from '../ui.tsx';
import { ConfirmArchiveDialog } from './ConfirmArchiveDialog.tsx';
import {
  editableStateType,
  StateDialog,
  type StateDraft,
  type StateType,
} from './StateDialog.tsx';

export type StateActions = {
  onCreate: (input: {
    teamId: string;
    name: string;
    type: StateType;
    color: string;
    position: number;
  }) => Promise<void>;
  onUpdate: (
    id: string,
    input: {
      name: string;
      type?: StateType;
      color: string;
      position: number;
      expectedVersion: number;
    },
  ) => Promise<void>;
  onArchive: (id: string, expectedVersion: number) => Promise<void>;
};

export function StatePanel({
  states,
  teams,
  actions,
}: {
  states: WorkflowState[];
  teams: Team[];
  actions: StateActions;
}) {
  const panel = useStatePanel(states, teams, actions);
  return (
    <div className="settings-section">
      <div className="settings-section-heading">
        <p>Statuses define each team's issue workflow.</p>
        <Button
          tone="primary"
          disabled={teams.length === 0}
          onClick={panel.openCreate}
        >
          <Plus size={15} /> New status
        </Button>
      </div>
      <StateRows
        states={states}
        teams={teams}
        onEdit={panel.openEdit}
        onArchive={panel.openArchive}
      />
      {panel.draft ? (
        <StateDialog
          draft={panel.draft}
          teams={teams}
          error={panel.error}
          submitting={panel.submitting}
          onChange={panel.setDraft}
          onClose={panel.closeDraft}
          onSubmit={() => void panel.save()}
        />
      ) : null}
      {panel.archiving ? (
        <ConfirmArchiveDialog
          title="Archive status"
          description={`Remove ${panel.archiving.name} from the active workflow. Restore it from Archived.`}
          confirmLabel="Archive status"
          error={panel.error}
          submitting={panel.submitting}
          onClose={panel.closeArchive}
          onConfirm={() => void panel.archive()}
        />
      ) : null}
    </div>
  );
}

function useStatePanel(
  states: WorkflowState[],
  teams: Team[],
  actions: StateActions,
) {
  const [draft, setDraft] = useState<StateDraft>();
  const [archiving, setArchiving] = useState<WorkflowState>();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const openCreate = () => {
    const teamId = teams[0]?.id;
    if (!teamId) return;
    setError('');
    setDraft({
      teamId,
      name: '',
      type: 'unstarted',
      color: '#9095a2',
      position: nextPosition(states, teamId),
    });
  };
  const openEdit = (item: WorkflowState) => {
    setError('');
    setDraft({
      item,
      teamId: item.teamId,
      name: item.name,
      type: item.type,
      color: item.color,
      position: item.position,
    });
  };
  const openArchive = (item: WorkflowState) => {
    setError('');
    setArchiving(item);
  };
  async function save() {
    if (!draft || submitting) return;
    await submit(setSubmitting, setError, async () => {
      const type = editableStateType(draft.type) ?? 'unstarted';
      if (draft.item)
        await actions.onUpdate(draft.item.id, {
          name: draft.name.trim(),
          ...(draft.type === draft.item.type ? {} : { type }),
          color: draft.color,
          position: draft.position,
          expectedVersion: draft.item.version,
        });
      else await actions.onCreate({ ...draft, name: draft.name.trim(), type });
      setDraft(undefined);
    });
  }
  async function archive() {
    if (!archiving || submitting) return;
    await submit(setSubmitting, setError, async () => {
      await actions.onArchive(archiving.id, archiving.version);
      setArchiving(undefined);
    });
  }
  return {
    draft,
    archiving,
    error,
    submitting,
    setDraft,
    openCreate,
    openEdit,
    openArchive,
    closeDraft: () => setDraft(undefined),
    closeArchive: () => setArchiving(undefined),
    save,
    archive,
  };
}

function StateRows({
  states,
  teams,
  onEdit,
  onArchive,
}: {
  states: WorkflowState[];
  teams: Team[];
  onEdit: (item: WorkflowState) => void;
  onArchive: (item: WorkflowState) => void;
}) {
  const ordered = [...states].sort(
    (left, right) =>
      teams.findIndex((team) => team.id === left.teamId) -
        teams.findIndex((team) => team.id === right.teamId) ||
      left.position - right.position,
  );
  return (
    <div className="settings-table">
      {ordered.map((item) => (
        <div className="settings-row" key={item.id}>
          <div className="settings-row-icon">
            <StatusIcon type={item.type} color={item.color} />
          </div>
          <div>
            <strong>{item.name}</strong>
            <span>
              {teams.find((team) => team.id === item.teamId)?.name ??
                'Unknown team'}{' '}
              · {item.type}
            </span>
          </div>
          <span className="row-spacer" />
          <IconButton label={`Edit ${item.name}`} onClick={() => onEdit(item)}>
            <Pencil size={14} />
          </IconButton>
          <IconButton
            label={`Archive ${item.name}`}
            onClick={() => onArchive(item)}
          >
            <Archive size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

async function submit(
  setSubmitting: (value: boolean) => void,
  setError: (value: string) => void,
  operation: () => Promise<void>,
) {
  setSubmitting(true);
  setError('');
  try {
    await operation();
  } catch (reason) {
    setError(
      reason instanceof Error ? reason.message : 'Could not save status',
    );
  } finally {
    setSubmitting(false);
  }
}

function nextPosition(states: WorkflowState[], teamId: string): number {
  return (
    Math.max(
      -1,
      ...states
        .filter((state) => state.teamId === teamId)
        .map((state) => state.position),
    ) + 1
  );
}

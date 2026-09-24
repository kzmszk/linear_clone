import { Archive, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Label } from '../../api.ts';
import { Button, Dialog, ErrorNotice, IconButton } from '../ui.tsx';
import { ConfirmArchiveDialog } from './ConfirmArchiveDialog.tsx';

type LabelDraft = {
  item?: Label;
  name: string;
  color: string;
};

export type LabelActions = {
  onCreate: (input: { name: string; color: string }) => Promise<void>;
  onUpdate: (
    id: string,
    input: { name: string; color: string; expectedVersion: number },
  ) => Promise<void>;
  onArchive: (id: string, expectedVersion: number) => Promise<void>;
};

export function LabelPanel({
  labels,
  actions,
}: {
  labels: Label[];
  actions: LabelActions;
}) {
  const panel = useLabelPanel(actions);
  return (
    <div className="settings-section">
      <ClassificationHeader
        description="Labels group issues across this workspace."
        action="New label"
        onCreate={panel.openCreate}
      />
      <LabelRows
        labels={labels}
        onEdit={panel.openEdit}
        onArchive={panel.openArchive}
      />
      {panel.draft ? (
        <LabelDialog
          draft={panel.draft}
          error={panel.error}
          submitting={panel.submitting}
          onChange={panel.setDraft}
          onClose={panel.closeDraft}
          onSubmit={() => void panel.save()}
        />
      ) : null}
      {panel.archiving ? (
        <ConfirmArchiveDialog
          title="Archive label"
          description={`Remove ${panel.archiving.name} from the active label list. Restore it from Archived.`}
          confirmLabel="Archive label"
          error={panel.error}
          submitting={panel.submitting}
          onClose={panel.closeArchive}
          onConfirm={() => void panel.archive()}
        />
      ) : null}
    </div>
  );
}

function useLabelPanel(actions: LabelActions) {
  const [draft, setDraft] = useState<LabelDraft>();
  const [archiving, setArchiving] = useState<Label>();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const openCreate = () => {
    setError('');
    setDraft({ name: '', color: '#8b80f9' });
  };
  const openEdit = (item: Label) => {
    setError('');
    setDraft({ item, name: item.name, color: item.color });
  };
  const openArchive = (item: Label) => {
    setError('');
    setArchiving(item);
  };
  async function save() {
    if (!draft || submitting) return;
    await submit(setSubmitting, setError, async () => {
      if (draft.item)
        await actions.onUpdate(draft.item.id, {
          name: draft.name.trim(),
          color: draft.color,
          expectedVersion: draft.item.version,
        });
      else
        await actions.onCreate({ name: draft.name.trim(), color: draft.color });
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

function ClassificationHeader({
  description,
  action,
  onCreate,
}: {
  description: string;
  action: string;
  onCreate: () => void;
}) {
  return (
    <div className="settings-section-heading">
      <p>{description}</p>
      <Button tone="primary" onClick={onCreate}>
        <Plus size={15} /> {action}
      </Button>
    </div>
  );
}

function LabelRows({
  labels,
  onEdit,
  onArchive,
}: {
  labels: Label[];
  onEdit: (item: Label) => void;
  onArchive: (item: Label) => void;
}) {
  return (
    <div className="settings-table">
      {labels.map((item) => (
        <div className="settings-row" key={item.id}>
          <div className="team-dot large" style={{ background: item.color }} />
          <div>
            <strong>{item.name}</strong>
            <span>{item.color}</span>
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

function LabelDialog({
  draft,
  error,
  submitting,
  onChange,
  onClose,
  onSubmit,
}: {
  draft: LabelDraft;
  error: string;
  submitting: boolean;
  onChange: (draft: LabelDraft) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const editing = Boolean(draft.item);
  return (
    <Dialog
      title={editing ? 'Edit label' : 'Create label'}
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
          <label className="form-field">
            <span>Label name</span>
            <input
              aria-label="Label name"
              data-dialog-autofocus
              value={draft.name}
              onChange={(event) =>
                onChange({ ...draft, name: event.target.value })
              }
            />
          </label>
          <label className="form-field">
            <span>Color</span>
            <input
              aria-label="Label color"
              type="color"
              value={draft.color}
              onChange={(event) =>
                onChange({ ...draft, color: event.target.value })
              }
            />
          </label>
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
            {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create label'}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : 'Could not save label';
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
    setError(errorMessage(reason));
  } finally {
    setSubmitting(false);
  }
}

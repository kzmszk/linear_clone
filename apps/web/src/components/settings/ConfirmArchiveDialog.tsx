import { Button, Dialog, ErrorNotice } from '../ui.tsx';

export function ConfirmArchiveDialog({
  title,
  description,
  confirmLabel,
  error,
  submitting,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  error: string;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      title={title}
      description={description}
      onClose={onClose}
      dismissible={!submitting}
    >
      {error ? <ErrorNotice message={error} /> : null}
      <footer className="dialog-footer">
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button tone="danger" onClick={onConfirm} disabled={submitting}>
          {submitting ? 'Archiving…' : confirmLabel}
        </Button>
      </footer>
    </Dialog>
  );
}

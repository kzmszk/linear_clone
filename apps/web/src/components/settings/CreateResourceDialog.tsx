import type { ReactNode } from 'react';
import { Button, Dialog, ErrorNotice } from '../ui.tsx';

export function CreateResourceDialog({
  open,
  title,
  description,
  error,
  submitting,
  valid,
  submitLabel,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  error: string;
  submitting: boolean;
  valid: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <Dialog title={title} description={description} onClose={onClose}>
      {error ? <ErrorNotice message={error} /> : null}
      <form
        className="create-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        {children}
        <footer className="dialog-footer">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="primary" disabled={submitting || !valid}>
            {submitting ? 'Saving…' : submitLabel}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}

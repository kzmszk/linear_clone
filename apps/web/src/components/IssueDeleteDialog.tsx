import { Button, Dialog } from './ui.tsx';

export function IssueDeleteDialog({
  identifier,
  onClose,
  onConfirm,
}: {
  identifier: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      title={`Move ${identifier} to trash?`}
      description="You can restore this issue from the trash later."
      onClose={onClose}
    >
      <footer className="dialog-footer">
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" tone="danger" onClick={onConfirm}>
          Move to trash
        </Button>
      </footer>
    </Dialog>
  );
}

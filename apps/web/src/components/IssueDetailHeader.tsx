import { ArrowLeft, Copy, RotateCcw, Trash2, X } from 'lucide-react';
import { IconButton } from './ui.tsx';

export function IssueDetailHeader({
  identifier,
  projectName,
  deleted,
  onClose,
  onDelete,
  onRestore,
  onCopy,
}: {
  identifier: string;
  projectName: string;
  deleted: boolean;
  onClose: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onCopy: () => void;
}) {
  return (
    <header className="detail-header">
      <div className="detail-breadcrumb">
        <IconButton label="Close issue" onClick={onClose}>
          <ArrowLeft size={16} />
        </IconButton>
        <button className="breadcrumb-id" onClick={onCopy}>
          {identifier}
          <Copy size={12} />
        </button>
        <span className="breadcrumb-separator">/</span>
        <span>{projectName}</span>
      </div>
      <div className="detail-header-actions">
        <IconButton
          label={deleted ? 'Restore issue' : 'Delete issue'}
          onClick={deleted ? onRestore : onDelete}
        >
          {deleted ? <RotateCcw size={16} /> : <Trash2 size={16} />}
        </IconButton>
        <IconButton label="Close issue" onClick={onClose}>
          <X size={17} />
        </IconButton>
      </div>
    </header>
  );
}

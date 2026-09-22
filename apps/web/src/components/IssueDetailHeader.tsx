import { ArrowLeft, Copy, RotateCcw, Trash2 } from 'lucide-react';
import { IconButton } from './ui.tsx';

export function IssueDetailHeader({
  identifier,
  projectName,
  deleted,
  lifecyclePending,
  lifecycleStatus,
  onClose,
  onDelete,
  onRestore,
  onCopy,
}: {
  identifier: string;
  projectName: string;
  deleted: boolean;
  lifecyclePending: boolean;
  lifecycleStatus?: string;
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
        {lifecycleStatus ? (
          <span className="detail-action-status" role="status">
            {lifecycleStatus}
          </span>
        ) : null}
        <IconButton
          label={deleted ? 'Restore issue' : 'Delete issue'}
          onClick={deleted ? onRestore : onDelete}
          disabled={lifecyclePending}
          aria-busy={lifecyclePending}
        >
          {deleted ? <RotateCcw size={16} /> : <Trash2 size={16} />}
        </IconButton>
      </div>
    </header>
  );
}

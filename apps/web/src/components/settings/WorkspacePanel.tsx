import { Building2, Check, Pencil, Plus } from 'lucide-react';
import type { Workspace } from '../../api.ts';
import { Button, IconButton } from '../ui.tsx';
import type { EditTarget } from './types.ts';

export function WorkspacePanel({
  workspaces,
  name,
  slug,
  onName,
  onSlug,
  submitting,
  onSubmit,
  onCreate,
  onEdit,
}: {
  workspaces: Workspace[];
  name: string;
  slug: string;
  onName: (value: string) => void;
  onSlug: (value: string) => void;
  submitting: boolean;
  onSubmit: () => void;
  onCreate: () => void;
  onEdit: (target: EditTarget) => void;
}) {
  return (
    <div className="settings-section">
      <WorkspaceHeader onCreate={onCreate} />
      <WorkspaceRows workspaces={workspaces} onEdit={onEdit} />
      <WorkspaceCreateForm
        name={name}
        slug={slug}
        onName={onName}
        onSlug={onSlug}
        submitting={submitting}
        onSubmit={onSubmit}
      />
    </div>
  );
}

function WorkspaceHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="settings-section-heading">
      <div>
        <p>Separate teams and permissions by workspace.</p>
      </div>
      <Button tone="primary" onClick={onCreate}>
        <Plus size={15} /> New workspace
      </Button>
    </div>
  );
}

function WorkspaceRows({
  workspaces,
  onEdit,
}: {
  workspaces: Workspace[];
  onEdit: (target: EditTarget) => void;
}) {
  return (
    <div className="settings-table">
      {workspaces.map((item) => (
        <div className="settings-row" key={item.id}>
          <div className="settings-row-icon">
            <Building2 size={16} />
          </div>
          <div>
            <strong>{item.name}</strong>
            <span>/{item.slug}</span>
          </div>
          <span className="row-spacer">
            {item.archivedAt ? 'Archived' : 'Active'}
          </span>
          <Check size={15} className="success-icon" />
          <IconButton
            label={`Edit ${item.name}`}
            onClick={() => onEdit({ kind: 'workspace', item })}
          >
            <Pencil size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

function WorkspaceCreateForm({
  name,
  slug,
  onName,
  onSlug,
  submitting,
  onSubmit,
}: {
  name: string;
  slug: string;
  onName: (value: string) => void;
  onSlug: (value: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="inline-create">
      <h3>Create workspace</h3>
      <div className="form-grid">
        <label className="form-field">
          <span>
            Name <em aria-hidden="true">Required</em>
          </span>
          <input
            aria-label="Name"
            required
            value={name}
            onChange={(event) => onName(event.target.value)}
            placeholder="Name"
          />
        </label>
        <label className="form-field">
          <span>
            Slug <em aria-hidden="true">Required</em>
          </span>
          <input
            aria-label="Slug"
            required
            pattern="[a-z0-9-]{1,40}"
            value={slug}
            onChange={(event) => onSlug(event.target.value)}
            placeholder="slug"
          />
        </label>
      </div>
      <Button
        tone="primary"
        disabled={submitting || !name.trim() || !slug.trim()}
        onClick={onSubmit}
      >
        {submitting ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { Issue, IssueHierarchy as Hierarchy } from '../api.ts';
import { Button, IconButton } from './ui.tsx';
import { IssuePicker } from './IssuePicker.tsx';

type IssueLink = Hierarchy['children'][number];
type HierarchyProps = {
  issue: Issue;
  hierarchy?: Hierarchy;
  workspaceId: string;
  onSetParent: (parentId: string | null) => Promise<void>;
  onSetChildParent: (
    child: Pick<Issue, 'id' | 'version'>,
    parentId: string | null,
  ) => Promise<void>;
  onSelectIssue: (id: string) => void;
};

export function IssueHierarchy({
  issue,
  hierarchy,
  workspaceId,
  onSetParent,
  onSetChildParent,
  onSelectIssue,
}: HierarchyProps) {
  const [picker, setPicker] = useState<'parent' | 'child' | null>(null);
  const [error, setError] = useState('');
  async function removeParent() {
    setError('');
    try {
      await onSetParent(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not remove parent',
      );
    }
  }
  async function removeChild(child: IssueLink) {
    setError('');
    try {
      await onSetChildParent(child, null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not remove child',
      );
    }
  }
  return (
    <section
      className="relation-section issue-hierarchy"
      aria-label="Issue hierarchy"
    >
      <div className="section-heading">
        <h3>Parent and sub-issues</h3>
        <Button onClick={() => setPicker('child')}>
          <Plus size={14} /> Add sub-issue
        </Button>
      </div>
      <HierarchyParent
        issue={issue}
        parent={hierarchy?.parent}
        onSelectIssue={onSelectIssue}
        onChange={() => setPicker('parent')}
        onRemove={() => void removeParent()}
      />
      <HierarchyChildren
        children={hierarchy?.children ?? []}
        onSelectIssue={onSelectIssue}
        onRemove={(child) => void removeChild(child)}
      />
      {error ? (
        <div role="alert" className="inline-error">
          {error}
        </div>
      ) : null}
      {picker ? (
        <IssuePicker
          title={
            picker === 'parent' ? 'Set parent issue' : 'Add existing sub-issue'
          }
          workspaceId={workspaceId}
          excludeIds={[
            issue.id,
            ...(hierarchy?.children.map((child) => child.id) ?? []),
          ]}
          onChoose={(selected) =>
            picker === 'parent'
              ? onSetParent(selected.id)
              : onSetChildParent(selected, issue.id)
          }
          onClose={() => setPicker(null)}
        />
      ) : null}
    </section>
  );
}

function HierarchyParent({
  issue,
  parent,
  onSelectIssue,
  onChange,
  onRemove,
}: {
  issue: Issue;
  parent?: IssueLink | null;
  onSelectIssue: (id: string) => void;
  onChange: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="hierarchy-parent">
      <span>Parent</span>
      {parent ? (
        <IssueLinkButton item={parent} onSelectIssue={onSelectIssue} />
      ) : issue.parentId ? (
        <span>Parent issue unavailable</span>
      ) : (
        <span>No parent</span>
      )}
      <Button onClick={onChange}>
        {issue.parentId ? 'Change parent' : 'Set parent'}
      </Button>
      {issue.parentId ? (
        <IconButton label="Remove parent" onClick={onRemove}>
          <X size={14} />
        </IconButton>
      ) : null}
    </div>
  );
}

function HierarchyChildren({
  children,
  onSelectIssue,
  onRemove,
}: {
  children: IssueLink[];
  onSelectIssue: (id: string) => void;
  onRemove: (child: IssueLink) => void;
}) {
  if (children.length === 0)
    return <p className="hierarchy-empty">No sub-issues</p>;
  return (
    <div className="hierarchy-children">
      {children.map((child) => (
        <div key={child.id} className="hierarchy-child">
          <IssueLinkButton item={child} onSelectIssue={onSelectIssue} />
          <IconButton
            label={`Remove ${child.identifier} as sub-issue`}
            onClick={() => onRemove(child)}
          >
            <X size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

function IssueLinkButton({
  item,
  onSelectIssue,
}: {
  item: IssueLink;
  onSelectIssue: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="hierarchy-link"
      onClick={() => onSelectIssue(item.id)}
    >
      <strong>{item.identifier}</strong>
      <span>{item.title}</span>
      {item.deletedAt ? (
        <small>Trash</small>
      ) : item.archivedAt ? (
        <small>Archived</small>
      ) : null}
    </button>
  );
}

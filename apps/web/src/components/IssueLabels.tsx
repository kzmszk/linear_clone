import { X } from 'lucide-react';
import type { Issue, Metadata } from '../api.ts';
import { PropertySelect } from './PropertySelect.tsx';
import { IconButton } from './ui.tsx';

export function IssueLabels({
  issue,
  labels,
  onSave,
}: {
  issue: Issue;
  labels: Metadata['labels'];
  onSave: (labelIds: string[]) => Promise<void>;
}) {
  const visible = labels.filter((label) => issue.labelIds.includes(label.id));
  const active = labels.filter(
    (label) => !label.archivedAt && !issue.labelIds.includes(label.id),
  );
  return (
    <div className="issue-labels">
      <div className="property-field">
        <span>Labels</span>
        <PropertySelect
          label="Add label"
          value=""
          options={active.map((label) => ({
            value: label.id,
            label: label.name,
            icon: (
              <span className="label-dot" style={{ background: label.color }} />
            ),
          }))}
          onChange={(labelId) => void onSave([...issue.labelIds, labelId])}
        />
      </div>
      {visible.length > 0 ? (
        <div className="issue-label-chips">
          {visible.map((label) => {
            return (
              <span className="issue-label-chip" key={label.id}>
                <span
                  className="label-dot"
                  style={{ background: label.color }}
                />
                {label.name}
                <IconButton
                  label={`Remove ${label.name}`}
                  onClick={() =>
                    void onSave(issue.labelIds.filter((id) => id !== label.id))
                  }
                >
                  <X size={12} />
                </IconButton>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

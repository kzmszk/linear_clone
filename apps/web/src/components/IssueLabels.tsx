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
  const active = labels.filter((label) => !issue.labelIds.includes(label.id));
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
      {issue.labelIds.length > 0 ? (
        <div className="issue-label-chips">
          {issue.labelIds.map((labelId) => {
            const label = labels.find((item) => item.id === labelId);
            return (
              <span className="issue-label-chip" key={labelId}>
                <span
                  className="label-dot"
                  style={{ background: label?.color ?? '#9095a2' }}
                />
                {label?.name ?? 'Archived label'}
                <IconButton
                  label={`Remove ${label?.name ?? 'archived label'}`}
                  onClick={() =>
                    void onSave(issue.labelIds.filter((id) => id !== labelId))
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

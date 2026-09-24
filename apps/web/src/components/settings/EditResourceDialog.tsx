import { Archive, Check } from 'lucide-react';
import type { Team } from '../../api.ts';
import { Button, Dialog, ErrorNotice } from '../ui.tsx';
import { TeamMultiSelect } from './TeamMultiSelect.tsx';
import type { ArchivableTarget, EditDraft } from './types.ts';
import { MemberFields } from './MemberEditFields.tsx';

export type EditResourceDialogProps = {
  draft: EditDraft;
  teams: Team[];
  formError: string;
  submitting: boolean;
  onClose: () => void;
  onDraftChange: (draft: EditDraft) => void;
  onSubmit: () => void;
  onDeactivate: () => void;
  onArchive: (target: ArchivableTarget) => void;
};

export function EditResourceDialog(props: EditResourceDialogProps) {
  const { draft, onClose } = props;
  const member = draft.kind === 'member';
  return (
    <Dialog title={`Edit ${draft.kind}`} onClose={onClose} wide={member}>
      <EditResourceForm {...props} />
    </Dialog>
  );
}

function EditResourceForm({
  draft,
  teams,
  formError,
  submitting,
  onClose,
  onDraftChange,
  onSubmit,
  onDeactivate,
  onArchive,
}: EditResourceDialogProps) {
  const valid = isEditFormValid(draft);
  return (
    <>
      {formError ? <ErrorNotice message={formError} /> : null}
      <form
        className="create-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <NameFields draft={draft} onDraftChange={onDraftChange} />
        <ResourceFields
          draft={draft}
          teams={teams}
          onDraftChange={onDraftChange}
        />
        <EditFooter
          draft={draft}
          submitting={submitting}
          valid={valid}
          onClose={onClose}
          onDeactivate={onDeactivate}
          onArchive={onArchive}
        />
      </form>
    </>
  );
}

function isEditFormValid(draft: EditDraft): boolean {
  if (draft.kind === 'member') return true;
  return Boolean(
    draft.name.trim() && (draft.kind !== 'workspace' || draft.slug.trim()),
  );
}

function NameFields({
  draft,
  onDraftChange,
}: {
  draft: EditDraft;
  onDraftChange: (draft: EditDraft) => void;
}) {
  const member = draft.kind === 'member';
  const name = member ? draft.item.name : draft.name;
  return (
    <>
      <label className="form-field">
        <span>
          {member ? 'Display name' : 'Name'}{' '}
          {!member && <em aria-hidden="true">Required</em>}
        </span>
        <input
          aria-label={member ? 'Display name' : 'Name'}
          data-dialog-autofocus
          required
          readOnly={member}
          value={name}
          onChange={
            member
              ? undefined
              : (event) => onDraftChange({ ...draft, name: event.target.value })
          }
        />
      </label>
      {draft.kind === 'workspace' ? (
        <label className="form-field">
          <span>
            Slug <em aria-hidden="true">Required</em>
          </span>
          <input
            aria-label="Slug"
            required
            value={draft.slug}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                slug: event.target.value.toLowerCase(),
              })
            }
          />
        </label>
      ) : null}
    </>
  );
}

function ResourceFields({
  draft,
  teams,
  onDraftChange,
}: {
  draft: EditDraft;
  teams: Team[];
  onDraftChange: (draft: EditDraft) => void;
}) {
  switch (draft.kind) {
    case 'workspace':
      return null;
    case 'team':
      return (
        <TeamFields
          checked={draft.private}
          onChange={(value) => onDraftChange({ ...draft, private: value })}
        />
      );
    case 'project':
      return (
        <ProjectFields
          description={draft.description}
          status={draft.status}
          teams={teams}
          teamIds={draft.teamIds}
          onDescription={(value) =>
            onDraftChange({ ...draft, description: value })
          }
          onStatus={(value) => onDraftChange({ ...draft, status: value })}
          onTeamIds={(value) => onDraftChange({ ...draft, teamIds: value })}
        />
      );
    case 'member':
      return (
        <MemberFields
          email={draft.item.email}
          role={draft.role}
          active={draft.active}
          teams={teams}
          teamIds={draft.teamIds}
          onRole={(value) => onDraftChange({ ...draft, role: value })}
          onActive={(value) => onDraftChange({ ...draft, active: value })}
          onTeamIds={(value) => onDraftChange({ ...draft, teamIds: value })}
        />
      );
  }
}

function EditFooter({
  draft,
  submitting,
  valid,
  onClose,
  onDeactivate,
  onArchive,
}: {
  draft: EditDraft;
  submitting: boolean;
  valid: boolean;
  onClose: () => void;
  onDeactivate: () => void;
  onArchive: (target: ArchivableTarget) => void;
}) {
  const member = draft.kind === 'member' ? draft : undefined;
  const pending = member?.item.userId === null;
  const archiveTarget = targetForArchive(draft);
  return (
    <footer className="dialog-footer">
      {member && (member.active || pending) ? (
        <Button
          type="button"
          tone="danger"
          onClick={onDeactivate}
          disabled={submitting}
        >
          {pending ? 'Revoke invitation' : 'Deactivate member'}
        </Button>
      ) : null}
      {archiveTarget ? (
        <Button
          type="button"
          tone="danger"
          onClick={() => onArchive(archiveTarget)}
          disabled={submitting}
        >
          <Archive size={14} /> Archive {archiveTarget.kind}
        </Button>
      ) : null}
      <span className="row-spacer" />
      <Button type="button" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" tone="primary" disabled={submitting || !valid}>
        <Check size={14} /> Save changes
      </Button>
    </footer>
  );
}

function targetForArchive(draft: EditDraft): ArchivableTarget | undefined {
  switch (draft.kind) {
    case 'workspace':
      return { kind: 'workspace', item: draft.item };
    case 'team':
      return { kind: 'team', item: draft.item };
    case 'project':
      return { kind: 'project', item: draft.item };
    case 'member':
      return undefined;
  }
}

function TeamFields({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="checkbox-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />{' '}
      Private team
    </label>
  );
}

function ProjectFields({
  description,
  status,
  teams,
  teamIds,
  onDescription,
  onStatus,
  onTeamIds,
}: {
  description: string;
  status: string;
  teams: Team[];
  teamIds: string[];
  onDescription: (value: string) => void;
  onStatus: (value: string) => void;
  onTeamIds: (value: string[]) => void;
}) {
  return (
    <>
      <label className="form-field">
        <span>Description</span>
        <textarea
          rows={4}
          value={description}
          onChange={(event) => onDescription(event.target.value)}
        />
      </label>
      <label className="form-field">
        <span>Status</span>
        <select
          value={status}
          onChange={(event) => onStatus(event.target.value)}
        >
          <option value="planned">Planned</option>
          <option value="started">Started</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <TeamMultiSelect teams={teams} value={teamIds} onChange={onTeamIds} />
    </>
  );
}

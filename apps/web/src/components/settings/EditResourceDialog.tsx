import { Check } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { Team } from '../../api.ts';
import { Button, Dialog, ErrorNotice } from '../ui.tsx';
import { TeamMultiSelect } from './TeamMultiSelect.tsx';
import type { EditTarget } from './types.ts';
import { MemberFields } from './MemberEditFields.tsx';

export type EditResourceDialogProps = {
  editing: EditTarget;
  teams: Team[];
  name: string;
  slug: string;
  description: string;
  status: string;
  teamPrivate: boolean;
  teamIds: string[];
  role: 'owner' | 'admin' | 'member';
  active: boolean;
  formError: string;
  submitting: boolean;
  setEditing: Dispatch<SetStateAction<EditTarget | null>>;
  resetForm: () => void;
  setName: (value: string) => void;
  setSlug: (value: string) => void;
  setDescription: (value: string) => void;
  setStatus: (value: string) => void;
  setTeamPrivate: (value: boolean) => void;
  setTeamIds: (value: string[]) => void;
  setRole: (value: 'owner' | 'admin' | 'member') => void;
  setActive: (value: boolean) => void;
  onSubmit: () => void;
  onDeactivate: () => void;
};

export function EditResourceDialog(props: EditResourceDialogProps) {
  const { editing, setEditing, resetForm } = props;
  function close() {
    setEditing(null);
    resetForm();
  }
  const member = editing.kind === 'member';
  const pending = member && editing.item.userId === null;
  return (
    <Dialog title={`Edit ${editing.kind}`} onClose={close} wide={member}>
      <EditResourceForm
        {...props}
        member={member}
        pending={pending}
        close={close}
      />
    </Dialog>
  );
}

function EditResourceForm({
  editing,
  teams,
  name,
  slug,
  description,
  status,
  teamPrivate,
  teamIds,
  role,
  active,
  formError,
  submitting,
  setName,
  setSlug,
  setDescription,
  setStatus,
  setTeamPrivate,
  setTeamIds,
  setRole,
  setActive,
  onSubmit,
  onDeactivate,
  pending,
  close,
}: EditResourceDialogProps & {
  member: boolean;
  pending: boolean;
  close: () => void;
}) {
  const member = editing.kind === 'member';
  const valid = isEditFormValid(editing, member, name, slug);
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
        <NameFields
          editing={editing}
          member={member}
          name={name}
          slug={slug}
          onName={setName}
          onSlug={setSlug}
        />
        <ResourceFields
          editing={editing}
          teams={teams}
          description={description}
          status={status}
          teamPrivate={teamPrivate}
          teamIds={teamIds}
          role={role}
          active={active}
          onDescription={setDescription}
          onStatus={setStatus}
          onTeamPrivate={setTeamPrivate}
          onTeamIds={setTeamIds}
          onRole={setRole}
          onActive={setActive}
        />
        <EditFooter
          member={member}
          pending={pending}
          active={active}
          submitting={submitting}
          valid={valid}
          onClose={close}
          onDeactivate={onDeactivate}
        />
      </form>
    </>
  );
}

function isEditFormValid(
  editing: EditTarget,
  member: boolean,
  name: string,
  slug: string,
): boolean {
  return (
    member ||
    (Boolean(name.trim()) &&
      (editing.kind !== 'workspace' || Boolean(slug.trim())))
  );
}

function NameFields({
  editing,
  member,
  name,
  slug,
  onName,
  onSlug,
}: {
  editing: EditTarget;
  member: boolean;
  name: string;
  slug: string;
  onName: (value: string) => void;
  onSlug: (value: string) => void;
}) {
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
          onChange={(event) => onName(event.target.value)}
        />
      </label>
      {editing.kind === 'workspace' ? (
        <label className="form-field">
          <span>
            Slug <em aria-hidden="true">Required</em>
          </span>
          <input
            aria-label="Slug"
            required
            value={slug}
            onChange={(event) => onSlug(event.target.value.toLowerCase())}
          />
        </label>
      ) : null}
    </>
  );
}

function ResourceFields({
  editing,
  teams,
  description,
  status,
  teamPrivate,
  teamIds,
  role,
  active,
  onTeamPrivate,
  onDescription,
  onStatus,
  onTeamIds,
  onRole,
  onActive,
}: {
  editing: EditTarget;
  teams: Team[];
  description: string;
  status: string;
  teamPrivate: boolean;
  teamIds: string[];
  role: 'owner' | 'admin' | 'member';
  active: boolean;
  onTeamPrivate: (value: boolean) => void;
  onDescription: (value: string) => void;
  onStatus: (value: string) => void;
  onTeamIds: (value: string[]) => void;
  onRole: (value: 'owner' | 'admin' | 'member') => void;
  onActive: (value: boolean) => void;
}) {
  if (editing.kind === 'team')
    return <TeamFields checked={teamPrivate} onChange={onTeamPrivate} />;
  if (editing.kind === 'project')
    return (
      <ProjectFields
        description={description}
        status={status}
        teams={teams}
        teamIds={teamIds}
        onDescription={onDescription}
        onStatus={onStatus}
        onTeamIds={onTeamIds}
      />
    );
  if (editing.kind === 'member')
    return (
      <MemberFields
        email={editing.item.email}
        role={role}
        active={active}
        teams={teams}
        teamIds={teamIds}
        onRole={onRole}
        onActive={onActive}
        onTeamIds={onTeamIds}
      />
    );
  return null;
}

function EditFooter({
  member,
  pending,
  active,
  submitting,
  valid,
  onClose,
  onDeactivate,
}: {
  member: boolean;
  pending: boolean;
  active: boolean;
  submitting: boolean;
  valid: boolean;
  onClose: () => void;
  onDeactivate: () => void;
}) {
  return (
    <footer className="dialog-footer">
      {member && (active || pending) ? (
        <Button
          type="button"
          tone="danger"
          onClick={onDeactivate}
          disabled={submitting}
        >
          {pending ? 'Revoke invitation' : 'Deactivate member'}
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

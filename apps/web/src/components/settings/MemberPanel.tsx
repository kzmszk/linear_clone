import { Mail, Pencil } from 'lucide-react';
import { useState } from 'react';
import type { Member, Team } from '../../api.ts';
import { Button, IconButton } from '../ui.tsx';
import { CreateResourceDialog } from './CreateResourceDialog.tsx';
import type { EditTarget } from './types.ts';
import { memberRole } from './types.ts';
import { TeamMultiSelect } from './TeamMultiSelect.tsx';

export function MemberPanel({
  members,
  teams,
  name,
  email,
  role,
  teamIds,
  formError,
  onName,
  onEmail,
  onRole,
  onTeamIds,
  submitting,
  onSubmit,
  onReset,
  onEdit,
}: {
  members: Member[];
  teams: Team[];
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  teamIds: string[];
  formError: string;
  onName: (value: string) => void;
  onEmail: (value: string) => void;
  onRole: (value: 'owner' | 'admin' | 'member') => void;
  onTeamIds: (value: string[]) => void;
  submitting: boolean;
  onSubmit: () => Promise<boolean>;
  onReset: () => void;
  onEdit: (target: EditTarget) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  function openCreate() {
    onReset();
    setCreateOpen(true);
  }
  function closeCreate() {
    setCreateOpen(false);
    onReset();
  }
  async function submitCreate() {
    if (await onSubmit()) setCreateOpen(false);
  }
  return (
    <div className="settings-section">
      <MemberHeader onCreate={openCreate} />
      <MemberRows members={members} teams={teams} onEdit={onEdit} />
      <CreateResourceDialog
        open={createOpen}
        title="Invite to your workspace"
        description="Invite a teammate and choose their workspace access."
        error={formError}
        submitting={submitting}
        valid={Boolean(email.trim())}
        submitLabel="Send invites"
        onClose={closeCreate}
        onSubmit={() => void submitCreate()}
      >
        <MemberCreateFields
          teams={teams}
          name={name}
          email={email}
          role={role}
          teamIds={teamIds}
          onName={onName}
          onEmail={onEmail}
          onRole={onRole}
          onTeamIds={onTeamIds}
        />
      </CreateResourceDialog>
    </div>
  );
}

function MemberCreateFields({
  teams,
  name,
  email,
  role,
  teamIds,
  onName,
  onEmail,
  onRole,
  onTeamIds,
}: {
  teams: Team[];
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  teamIds: string[];
  onName: (value: string) => void;
  onEmail: (value: string) => void;
  onRole: (value: 'owner' | 'admin' | 'member') => void;
  onTeamIds: (value: string[]) => void;
}) {
  return (
    <>
      <label className="form-field">
        <span>
          Member email <em aria-hidden="true">Required</em>
        </span>
        <input
          aria-label="Member email"
          type="email"
          required
          value={email}
          onChange={(event) => onEmail(event.target.value)}
          placeholder="name@company.com"
        />
      </label>
      <label className="form-field">
        <span>Member role</span>
        <select
          aria-label="Member role"
          value={role}
          onChange={(event) => onRole(memberRole(event.target.value))}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <label className="form-field">
        <span>Member name</span>
        <input
          aria-label="Member name"
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder="Display name (optional)"
        />
      </label>
      <TeamMultiSelect teams={teams} value={teamIds} onChange={onTeamIds} />
    </>
  );
}

function MemberHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="settings-section-heading">
      <div>
        <p>Manage people, roles, access, and team memberships.</p>
      </div>
      <Button tone="primary" onClick={onCreate}>
        <Mail size={15} /> Invite member
      </Button>
    </div>
  );
}

function MemberRows({
  members,
  teams,
  onEdit,
}: {
  members: Member[];
  teams: Team[];
  onEdit: (target: EditTarget) => void;
}) {
  return (
    <div className="settings-table">
      {members.map((item) => (
        <div className="settings-row" key={item.id}>
          <div className="member-avatar">
            {(item.name || item.email)[0]?.toUpperCase()}
          </div>
          <div>
            <strong>
              {item.userId === null
                ? 'Pending member'
                : item.name || item.email}
            </strong>
            <span>
              {item.email} · {item.role} ·{' '}
              {item.teamIds
                .map((id) => teams.find((team) => team.id === id)?.key)
                .filter(Boolean)
                .join(', ') || 'No teams'}
            </span>
          </div>
          <span className="row-spacer">
            {item.userId === null
              ? 'Pending'
              : item.active
                ? 'Active'
                : 'Inactive'}
          </span>
          <IconButton
            label={`Edit ${item.email}`}
            onClick={() => onEdit({ kind: 'member', item })}
          >
            <Pencil size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

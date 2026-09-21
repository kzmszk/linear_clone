import { Mail, Pencil } from 'lucide-react';
import type { Member, Team } from '../../api.ts';
import { Button, IconButton } from '../ui.tsx';
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
  onName,
  onEmail,
  onRole,
  onTeamIds,
  submitting,
  onSubmit,
  onEdit,
}: {
  members: Member[];
  teams: Team[];
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  teamIds: string[];
  onName: (value: string) => void;
  onEmail: (value: string) => void;
  onRole: (value: 'owner' | 'admin' | 'member') => void;
  onTeamIds: (value: string[]) => void;
  submitting: boolean;
  onSubmit: () => void;
  onEdit: (target: EditTarget) => void;
}) {
  return (
    <div className="settings-section">
      <MemberHeader />
      <MemberRows members={members} teams={teams} onEdit={onEdit} />
      <div className="inline-create">
        <h3>Invite member</h3>
        <div className="form-grid">
          <input
            aria-label="Member email"
            type="email"
            value={email}
            onChange={(event) => onEmail(event.target.value)}
            placeholder="name@company.com"
          />
          <select
            aria-label="Member role"
            value={role}
            onChange={(event) => onRole(memberRole(event.target.value))}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <input
          aria-label="Member name"
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder="Display name (optional)"
        />
        <TeamMultiSelect teams={teams} value={teamIds} onChange={onTeamIds} />
        <Button
          tone="primary"
          disabled={submitting || !email.trim()}
          onClick={onSubmit}
        >
          <Mail size={15} /> Invite member
        </Button>
      </div>
    </div>
  );
}

function MemberHeader() {
  return (
    <div className="settings-section-heading">
      <div>
        <h2>Members</h2>
        <p>Manage people, roles, access, and team memberships.</p>
      </div>
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

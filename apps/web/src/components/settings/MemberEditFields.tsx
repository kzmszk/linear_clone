import type { Team } from '../../api.ts';
import { TeamMultiSelect } from './TeamMultiSelect.tsx';
import { memberRole } from './types.ts';

export function MemberFields({
  email,
  role,
  active,
  teams,
  teamIds,
  onRole,
  onActive,
  onTeamIds,
}: {
  email: string;
  role: 'owner' | 'admin' | 'member';
  active: boolean;
  teams: Team[];
  teamIds: string[];
  onRole: (value: 'owner' | 'admin' | 'member') => void;
  onActive: (value: boolean) => void;
  onTeamIds: (value: string[]) => void;
}) {
  return (
    <>
      <p className="form-help">{email}</p>
      <label className="form-field">
        <span>Role</span>
        <select
          value={role}
          onChange={(event) => onRole(memberRole(event.target.value))}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
      </label>
      <TeamMultiSelect teams={teams} value={teamIds} onChange={onTeamIds} />
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => onActive(event.target.checked)}
        />{' '}
        Active member
      </label>
    </>
  );
}
